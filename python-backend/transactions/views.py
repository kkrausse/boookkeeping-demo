from rest_framework import viewsets, status, parsers, pagination, filters
from rest_framework.response import Response
from rest_framework.decorators import action
from django_filters.rest_framework import DjangoFilterBackend, FilterSet, CharFilter, NumberFilter
import csv
from io import TextIOWrapper
from decimal import Decimal, InvalidOperation
from django.utils import timezone
from datetime import datetime
import pytz
from .models import Transaction, TransactionFlag, TransactionRule
from .serializers import TransactionSerializer, TransactionCSVSerializer, TransactionRuleSerializer
from .utils import create_transaction_with_flags, update_transaction_with_flags, log_info

class TransactionFilter(FilterSet):
    description__icontains = CharFilter(field_name='description', lookup_expr='icontains')
    amount__gt = NumberFilter(field_name='amount', lookup_expr='gt')
    amount__lt = NumberFilter(field_name='amount', lookup_expr='lt')
    
    class Meta:
        model = Transaction
        fields = ['description', 'category', 'amount', 'datetime']

class StandardResultsSetPagination(pagination.PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100

class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.all().order_by('-created_at')
    serializer_class = TransactionSerializer
    pagination_class = StandardResultsSetPagination
    
    # Enable filtering and ordering
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = TransactionFilter
    ordering_fields = ['description', 'category', 'amount', 'datetime', 'created_at', 'updated_at']
    ordering = ['-created_at']  # Default ordering
    
    @action(detail=True, methods=['post'], url_path='resolve-flag/(?P<flag_id>[^/.]+)')
    def resolve_flag(self, request, pk=None, flag_id=None):
        """
        Resolve (delete) a specific flag for a transaction
        """
        transaction = self.get_object()
        
        try:
            # Find the specific flag
            flag = transaction.flags.get(pk=flag_id)
            
            # Check if the flag is resolvable
            if not flag.is_resolvable:
                return Response({
                    'status': 'error',
                    'message': 'This flag cannot be manually resolved'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Delete the flag
            flag.delete()
            
            return Response({
                'status': 'success',
                'message': 'Flag resolved successfully'
            })
            
        except TransactionFlag.DoesNotExist:
            return Response({
                'status': 'error',
                'message': 'Flag not found'
            }, status=status.HTTP_404_NOT_FOUND)
    
    def create(self, request, *args, **kwargs):
        """Override create to handle flags."""
        try:
            # Use our utility to create transaction with flags
            transaction, flags = create_transaction_with_flags(request.data)
            
            # Serialize and return
            serializer = self.get_serializer(transaction)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    def update(self, request, *args, **kwargs):
        """Override update to handle flags."""
        instance = self.get_object()
        
        try:
            # Use our utility to update transaction with flags directly
            # The utility now handles all data conversions internally
            transaction, flags = update_transaction_with_flags(instance, request.data)
            
            # Serialize and return
            serializer = self.get_serializer(transaction)
            return Response(serializer.data)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
    def partial_update(self, request, *args, **kwargs):
        """Override partial_update to handle flags."""
        instance = self.get_object()
        
        try:
            # The update_transaction_with_flags utility now handles partial updates
            # by preserving existing values if not provided in the request data
            transaction, flags = update_transaction_with_flags(instance, request.data)
            
            # Serialize and return
            serializer = self.get_serializer(transaction)
            return Response(serializer.data)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], serializer_class=TransactionCSVSerializer,
            parser_classes=[parsers.MultiPartParser])
    def upload(self, request, *args, **kwargs):
        log_info('starting')
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

        log_info('iterating')
        for row_num, row in enumerate(reader, start=1):
            try:
                # Use the utility function to create transaction with flags
                transaction, flags = create_transaction_with_flags(row)
                created_transactions.append(transaction)
                
                # Add warning if we had any flags
                if flags:
                    formatted_flags = ", ".join([f"{flag['flag_type']}: {flag['message']}" for flag in flags])
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

        log_info('serializing')
        # Serialize the created transactions
        transaction_serializer = TransactionSerializer(created_transactions, many=True)

        log_info('resp')
        response_data = {
            "created": transaction_serializer.data,
            "created_count": len(created_transactions),
            "warnings": warnings if warnings else None,
            "errors": skipped_rows if skipped_rows else None
        }

        log_info('boom')
        if created_transactions:
            if skipped_rows:
                status_code = status.HTTP_207_MULTI_STATUS
            else:
                status_code = status.HTTP_201_CREATED
        else:
            status_code = status.HTTP_400_BAD_REQUEST
            
        return Response(response_data, status=status_code)
        
class TransactionRuleViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows transaction rules to be viewed, created, updated or deleted.
    """
    queryset = TransactionRule.objects.all().order_by('-created_at')
    serializer_class = TransactionRuleSerializer
    pagination_class = StandardResultsSetPagination
    
    @action(detail=True, methods=['post'])
    def apply_to_all(self, request, pk=None):
        """Apply this rule to all existing transactions."""
        rule = self.get_object()
        
        # Import here to avoid circular imports
        from .utils import update_transaction_with_flags
        from .models import Transaction, TransactionFlag
        
        # Get all transactions
        transactions = Transaction.objects.all()
        
        # Count of transactions updated
        updated_count = 0
        
        # Process each transaction
        for transaction in transactions:
            # Use our existing utility function to make sure we're applying
            # rules consistently and updating flags properly
            data = {
                'description': transaction.description,
                'category': transaction.category,
                'amount': transaction.amount,
                'datetime': transaction.datetime
            }
            
            # Update the transaction using our utility which handles rules and flags
            updated_tx, _ = update_transaction_with_flags(transaction, data)
            updated_count += 1
        
        return Response({
            'rule_id': rule.id,
            'updated_count': updated_count
        })
    
    @action(detail=False, methods=['post'])
    def apply_all_rules(self, request):
        """Apply all rules to all existing transactions."""
        # Import here to avoid circular imports
        from .utils import apply_transaction_rules, update_transaction_with_flags
        from .models import Transaction
        
        # Get all transactions
        transactions = Transaction.objects.all()
        
        # Count of transactions updated
        updated_count = 0
        
        # Process each transaction
        for transaction in transactions:
            # Create a data dict from the transaction
            data = {
                'description': transaction.description,
                'category': transaction.category,
                'amount': transaction.amount,
                'datetime': transaction.datetime
            }
            
            # Apply all rules and update the transaction
            updated_tx, _ = update_transaction_with_flags(transaction, data)
            updated_count += 1
        
        return Response({
            'updated_count': updated_count
        })
