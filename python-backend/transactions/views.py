from rest_framework import viewsets, status, parsers, pagination, filters
from rest_framework.response import Response
from rest_framework.decorators import action
import csv
from io import TextIOWrapper
from decimal import Decimal, InvalidOperation
from .models import Transaction
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

        # Validate CSV headers
        required_headers = {'description', 'category', 'amount'}
        if not required_headers.issubset(reader.fieldnames):
            return Response(
                {"error": "CSV must contain 'description', 'category', and 'amount' headers"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Process each row
        created_transactions = []
        errors = []
        for row_num, row in enumerate(reader, start=1):
            try:
                # Convert amount to Decimal
                amount = Decimal(row['amount'])
                transaction = Transaction(
                    description=row['description'],
                    category=row['category'],
                    amount=amount
                )
                transaction.full_clean()  # Validate model fields
                transaction.save()
                created_transactions.append(transaction)
            except (ValueError, InvalidOperation):
                errors.append(f"Row {row_num}: Invalid amount '{row['amount']}'")
            except Exception as e:
                errors.append(f"Row {row_num}: {str(e)}")

        # Serialize the created transactions
        transaction_serializer = TransactionSerializer(created_transactions, many=True)

        response_data = {
            "created": transaction_serializer.data,
            "errors": errors if errors else None
        }
        status_code = status.HTTP_201_CREATED if not errors else status.HTTP_207_MULTI_STATUS
        return Response(response_data, status=status_code)
