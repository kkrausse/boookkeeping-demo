from rest_framework import viewsets, status, parsers, pagination, filters
from rest_framework.response import Response
from rest_framework.decorators import action
from django_filters.rest_framework import DjangoFilterBackend, FilterSet, CharFilter, NumberFilter
import csv
from io import TextIOWrapper
from decimal import Decimal, InvalidOperation
from django.utils import timezone
from django.db import models
from datetime import datetime
import pytz
import logging
import time
import functools
from .models import Transaction, TransactionFlag, TransactionRule
from .serializers import TransactionSerializer, TransactionCSVSerializer, TransactionRuleSerializer
from .utils import create_transaction_with_flags, clear_transaction_flags_bulk, create_validation_flags_bulk, update_transaction_with_flags, timer, apply_transaction_rules, apply_transaction_rule

# Set up logging
logger = logging.getLogger(__name__)

def api_timer(method):
    """Decorator to time API methods with detailed request information"""
    @functools.wraps(method)
    def timed_method(self, request, *args, **kwargs):
        start_time = time.time()
        
        # Get request details for logging
        view_name = self.__class__.__name__
        method_name = method.__name__
        
        result = method(self, request, *args, **kwargs)
        
        # Calculate duration and log
        duration = time.time() - start_time
        
        # Get details about the request/response
        request_method = request.method
        path = request.path
        status_code = result.status_code if hasattr(result, 'status_code') else 'N/A'
        
        # Log details
        logger.info(
            f"API call: {view_name}.{method_name} | {request_method} {path} | "
            f"Status: {status_code} | Duration: {duration:.3f}s | "
            f"Args: {args} | Kwargs: {kwargs}"
        )
        
        return result
    return timed_method

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
    # Keep the queryset attribute for DRF router but use get_queryset for actual queries
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer
    pagination_class = StandardResultsSetPagination
    
    # Enable filtering and ordering
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = TransactionFilter
    ordering_fields = ['description', 'category', 'amount', 'datetime', 'created_at', 'updated_at', 'flag_count']
    ordering = ['-created_at']  # Default ordering
    
    def list(self, request, *args, **kwargs):
        """Override list to add flag counts by type for the entire collection"""
        # Get the filtered queryset
        queryset = self.filter_queryset(self.get_queryset())
        
        # Get total flag counts by type from the database
        from django.db.models import Count
        from .models import TransactionFlag
        
        # Create a query to get flags for all transactions in the queryset
        transaction_ids = queryset.values_list('id', flat=True)
        
        # Get counts by flag_type for all flags of transactions in the filtered queryset
        flag_counts = TransactionFlag.objects.filter(
            transaction_id__in=transaction_ids,
            is_resolved=False
        ).values('flag_type').annotate(
            count=Count('id')
        ).order_by()
        
        # Convert to dictionary
        flag_counts_dict = {item['flag_type']: item['count'] for item in flag_counts}
        flag_counts_dict['total'] = sum(flag_counts_dict.values())
        
        # Continue with standard list logic
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            response = self.get_paginated_response(serializer.data)
            # Add flag counts to the paginated response
            response.data['flag_counts'] = flag_counts_dict
            return response
        
        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'results': serializer.data,
            'flag_counts': flag_counts_dict
        })
    
    def get_queryset(self):
        """
        Override get_queryset to add annotation for flag_count to enable sorting by flag count
        """
        # Time queryset generation
        start_time = time.time()
        
        queryset = Transaction.objects.all()
        
        # Annotate with total flag count for sorting by number of unresolved flags
        queryset = queryset.annotate(
            flag_count=models.Count('flags', filter=models.Q(flags__is_resolved=False))
        )
        
        # Apply default ordering
        result = queryset.order_by('-created_at')
        
        # Log duration for complex queries
        duration = time.time() - start_time
        if duration > 0.1:  # Only log if took more than 100ms
            logger.info(f"Complex query took {duration:.3f}s: get_queryset {self.__class__.__name__}")
            
        return result
    
    @api_timer
    @action(detail=True, methods=['post'], url_path='resolve-flag/(?P<flag_id>[^/.]+)')
    def resolve_flag(self, request, pk=None, flag_id=None):
        """
        Mark a specific flag as resolved for a transaction
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
            
            # Mark as resolved instead of deleting
            flag.is_resolved = True
            flag.save()
            
            return Response({
                'status': 'success',
                'message': 'Flag resolved successfully'
            })
            
        except TransactionFlag.DoesNotExist:
            return Response({
                'status': 'error',
                'message': 'Flag not found'
            }, status=status.HTTP_404_NOT_FOUND)
    
    @api_timer
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
    
    @api_timer
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
            
    @api_timer
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

    @api_timer
    @action(detail=False, methods=['post'], serializer_class=TransactionCSVSerializer,
            parser_classes=[parsers.MultiPartParser])
    def upload(self, request, *args, **kwargs):
        start_time = time.time()
        logger.info("Starting CSV upload")
        
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Import here to avoid circular imports
        from .utils import get_cached_rules, create_transactions_with_flags_bulk

        # Preload rules cache before processing CSV
        # This ensures we only fetch rules once for the entire upload
        _ = get_cached_rules()

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

        logger.info(f"CSV parsing started at {time.time() - start_time:.3f}s")
        preprocessing_start = time.time()
        
        # Read all rows from CSV into memory
        rows = []
        row_nums = {}  # Map to keep track of original row numbers
        for row_num, row in enumerate(reader, start=1):
            rows.append(row)
            # Store original row number for each row
            row_nums[len(rows) - 1] = row_num
        
        logger.info(f"Read {len(rows)} rows from CSV in {time.time() - preprocessing_start:.3f}s")
        
        # Handle empty file
        if not rows:
            return Response(
                {"error": "CSV file is empty or contains no valid data"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Process all rows in bulk
        processing_start = time.time()
        created_transactions = []
        skipped_rows = []
        warnings = []
        
        # Track skipped rows by comparing original and processed counts
        original_row_count = len(rows)
        
        try:
            # Use bulk creation mode
            transactions, flags_map = create_transactions_with_flags_bulk(rows)
            created_transactions = transactions
            
            # Collect skipped row information by checking which rows are missing
            # Skipped rows would have amount=None, description='' and category=''
            for row_idx, row in enumerate(rows):
                # Use the original row number from our mapping
                original_row_num = row_nums.get(row_idx, row_idx+1)
                
                # Check if this row meets our skip criteria (missing all required fields)
                amount = row.get('amount', '').strip() if isinstance(row.get('amount', ''), str) else row.get('amount', '')
                description = row.get('description', '').strip()
                category = row.get('category', '').strip()
                
                if (not amount and not description and not category):
                    skipped_rows.append({
                        "row": original_row_num,
                        "data": row,
                        "reason": "Missing all required fields: amount, description, and category"
                    })
            
            # Process warnings for each transaction
            for i, transaction in enumerate(transactions):
                if transaction.id in flags_map and flags_map[transaction.id]:
                    formatted_flags = ", ".join([
                        f"{flag['flag_type']}: {flag['message']}" 
                        for flag in flags_map[transaction.id]
                    ])
                    # Use the original row number from our mapping
                    original_row_num = row_nums.get(i, i+1)
                    warnings.append(f"Row {original_row_num}: Created with warnings - {formatted_flags}")
            
        except Exception as e:
            # Handle global errors that affect the entire bulk operation
            logger.error(f"Error in bulk transaction creation: {str(e)}")
            return Response(
                {"error": f"Error processing CSV: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        processing_time = time.time() - processing_start
        logger.info(f"CSV processing complete: {len(rows)} rows in {processing_time:.3f}s ({len(rows)/processing_time:.1f} rows/sec)")
        
        # Skip serialization of all transactions for better performance
        logger.info("Skipping full transaction serialization, returning only counts and skipped rows")

        # Prepare response with just counts and skipped rows
        response_data = {
            "created_count": len(created_transactions),
            "skipped_count": len(skipped_rows),
            "skipped_rows": skipped_rows[:100] if skipped_rows else None  # Limit to first 100 skipped rows
        }

        if created_transactions:
            if skipped_rows:
                status_code = status.HTTP_207_MULTI_STATUS
            else:
                status_code = status.HTTP_201_CREATED
        else:
            status_code = status.HTTP_400_BAD_REQUEST
        
        total_time = time.time() - start_time
        logger.info(f"Upload complete: {len(created_transactions)} created, {len(skipped_rows)} errors in {total_time:.3f}s")
            
        return Response(response_data, status=status_code)
        
class TransactionRuleViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows transaction rules to be viewed, created, updated or deleted.
    """
    queryset = TransactionRule.objects.all().order_by('-created_at')
    serializer_class = TransactionRuleSerializer
    pagination_class = StandardResultsSetPagination
    
    @api_timer
    @action(detail=True, methods=['post'])
    def apply_to_all(self, request, pk=None):
        """Apply a rule to all existing transactions using optimized function."""
        try:
            rule = self.get_object()
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)

        try:
            start_time = time.time()
            result, filtered_queryset = apply_transaction_rule(rule.id)
            total_time = time.time() - start_time

            print('update txns', filtered_queryset)
            # Add time taken to the result
            result['time_taken'] = f"{total_time:.3f}s"
            clear_transaction_flags_bulk(filtered_queryset, ['PARSE_ERROR', 'MISSING_DATA'], only_unresolved=True)
            create_validation_flags_bulk(filtered_queryset)
            
            logger.info(f"Rule {rule.id} applied to all transactions: {result['updated_count']} updated in {total_time:.3f}s")
            return Response(result)
            
        except Exception as e:
            logger.error(f"Error applying rule {rule.id} to all transactions: {str(e)}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    @api_timer
    @action(detail=False, methods=['post'])
    def apply_all_rules(self, request):
        """Apply all rules to all existing transactions using optimized batch processing."""
        from .utils import apply_transaction_rules

        start_time = time.time()
        
        # Get total count for progress tracking
        total_count = Transaction.objects.count()
        
        # Apply all rules to all transactions
        try:
            logger.info(f"Applying all rules to {total_count} transactions")
            result = apply_transaction_rules()
            
            total_time = time.time() - start_time
            
            logger.info(
                f"All {result['rules_applied']} rules applied to {result['processed_count']} transactions: "
                f"{result['updated_count']} updated, {result['flag_count']} flags in {total_time:.3f}s"
            )
            
            return Response({
                'updated_count': result['updated_count'],
                'flag_count': result['flag_count'],
                'rules_applied': result['rules_applied'],
                'time_taken': f"{total_time:.3f}s"
            })
        except Exception as e:
            logger.error(f"Error applying rules to transactions: {str(e)}")
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
