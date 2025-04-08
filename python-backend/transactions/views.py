from rest_framework import viewsets, status, parsers, pagination, filters
from rest_framework.response import Response
from rest_framework.decorators import action
import csv
from io import TextIOWrapper
from decimal import Decimal, InvalidOperation
from django.utils import timezone
from datetime import datetime
import pytz
from .models import Transaction, TransactionFlag
from .serializers import TransactionSerializer, TransactionCSVSerializer

class StandardResultsSetPagination(pagination.PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100

class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.all().order_by('-created_at')
    serializer_class = TransactionSerializer
    pagination_class = StandardResultsSetPagination
    
    # Enable filtering and ordering
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['description', 'category', 'amount', 'datetime', 'created_at', 'updated_at']
    ordering = ['-created_at']  # Default ordering

    @action(detail=False, methods=['post'], serializer_class=TransactionCSVSerializer,
            parser_classes=[parsers.MultiPartParser])
    def upload(self, request, *args, **kwargs):
        
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        csv_file = serializer.validated_data['file']
        # Wrap binary file in TextIOWrapper to handle CSV reading
        text_file = TextIOWrapper(csv_file.file, encoding='utf-8')
        reader = csv.DictReader(text_file)

        # Check for minimum required headers
        required_headers = {'description', 'amount'}
        if not any(header in reader.fieldnames for header in required_headers):
            return Response(
                {"error": "CSV must contain at least 'description' or 'amount' column"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Process each row
        created_transactions = []
        skipped_rows = []
        warnings = []
        
        for row_num, row in enumerate(reader, start=1):
            try:
                # Initialize transaction with default values
                transaction_data = {
                    'description': row.get('description', ''),
                    'category': row.get('category', ''),
                    'datetime': timezone.now(),  # Default to current time
                }
                
                # Create flags list for this transaction
                transaction_flags = []
                
                # Process amount with graceful error handling
                try:
                    if 'amount' in row and row['amount']:
                        transaction_data['amount'] = Decimal(row['amount'])
                    else:
                        transaction_data['amount'] = Decimal('0.00')
                        transaction_flags.append({
                            'flag_type': 'PARSE_ERROR',
                            'message': f"Missing or invalid amount value"
                        })
                except (ValueError, InvalidOperation):
                    transaction_data['amount'] = Decimal('0.00')
                    transaction_flags.append({
                        'flag_type': 'PARSE_ERROR',
                        'message': f"Could not parse amount: '{row.get('amount', '')}'"
                    })
                
                # Process datetime with graceful error handling
                if 'datetime' in row and row['datetime']:
                    try:
                        # Try common datetime formats
                        formats = [
                            '%Y-%m-%d %H:%M:%S',  # 2023-01-01 14:30:00
                            '%Y-%m-%d',           # 2023-01-01
                            '%m/%d/%Y %H:%M:%S',  # 01/01/2023 14:30:00
                            '%m/%d/%Y',           # 01/01/2023
                            '%d/%m/%Y',           # 31/12/2023
                            '%b %d %Y',           # Jan 01 2023
                        ]
                        
                        dt = None
                        for fmt in formats:
                            try:
                                dt = datetime.strptime(row['datetime'], fmt)
                                break
                            except ValueError:
                                continue
                        
                        if dt:
                            # Ensure timezone awareness
                            if timezone.is_naive(dt):
                                dt = timezone.make_aware(dt)
                            transaction_data['datetime'] = dt
                        else:
                            raise ValueError(f"Couldn't parse date format")
                    except Exception:
                        transaction_flags.append({
                            'flag_type': 'PARSE_ERROR',
                            'message': f"Could not parse date: '{row['datetime']}'"
                        })
                
                # Check if we have enough valid data to create a transaction
                if (not transaction_data['description'] and 
                    transaction_data['amount'] == Decimal('0.00')):
                    raise ValueError("Both description and amount are missing or invalid")
                
                # Create and save transaction
                transaction = Transaction(**transaction_data)
                transaction.save()
                
                # Create transaction flags for this record
                for flag_data in transaction_flags:
                    TransactionFlag.objects.create(
                        transaction=transaction,
                        flag_type=flag_data['flag_type'],
                        message=flag_data['message']
                    )
                
                created_transactions.append(transaction)
                
                # Add warning if we had any flags
                if transaction_flags:
                    formatted_flags = ", ".join([f"{flag['flag_type']}: {flag['message']}" for flag in transaction_flags])
                    warnings.append(f"Row {row_num}: Created with warnings - {formatted_flags}")
                
            except Exception as e:
                # Convert technical errors to user-friendly messages
                error_msg = str(e)
                if "NOT NULL constraint failed" in error_msg and "datetime" in error_msg:
                    error_msg = "Missing required date field"
                elif "NOT NULL constraint failed" in error_msg:
                    field = error_msg.split("NOT NULL constraint failed: transactions_transaction.")[1]
                    error_msg = f"Missing required {field} field"
                
                skipped_rows.append(f"Row {row_num}: {error_msg}")

        # Serialize the created transactions
        transaction_serializer = TransactionSerializer(created_transactions, many=True)

        response_data = {
            "created": transaction_serializer.data,
            "created_count": len(created_transactions),
            "warnings": warnings if warnings else None,
            "errors": skipped_rows if skipped_rows else None
        }
        
        if created_transactions:
            if skipped_rows:
                status_code = status.HTTP_207_MULTI_STATUS
            else:
                status_code = status.HTTP_201_CREATED
        else:
            status_code = status.HTTP_400_BAD_REQUEST
            
        return Response(response_data, status=status_code)
