"""Utility functions for transaction processing."""
from datetime import datetime
from decimal import Decimal, InvalidOperation
from django.utils import timezone

import logging
import time
from .models import TransactionRule, Transaction

logger = logging.getLogger(__name__)

def log_info(*args):
    logger.info(' '.join(str(arg) for arg in args))

def timer(func):
    """Decorator to time functions and log execution time"""
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        duration = time.time() - start_time
        logger.info(f"Operation '{func.__name__}' completed in {duration:.3f}s")
        return result
    return wrapper

def parse_amount(amount_str):
    """
    Parse an amount string into a Decimal, handling errors gracefully.
    Returns None for empty/missing values with a flag.
    
    Args:
        amount_str: String representation of an amount
        
    Returns:
        tuple: (Decimal amount or None, flag dict or None)
    """
    try:
        # Check for empty/None values
        if amount_str is None or (isinstance(amount_str, str) and not amount_str.strip()):
            return None, {
                'flag_type': 'PARSE_ERROR',
                'message': "Missing or invalid amount value"
            }
        # Try to parse the amount
        return Decimal(amount_str), None
    except (ValueError, InvalidOperation, TypeError):
        # For parsing errors, return None with flag
        return None, {
            'flag_type': 'PARSE_ERROR',
            'message': f"Could not parse amount: '{amount_str}'"
        }

def parse_datetime(date_str):
    """
    Parse a datetime string, trying multiple formats including ISO format.
    
    Args:
        date_str: String representation of a date/time
        
    Returns:
        tuple: (datetime object or None, flag dict or None)
    """
    if not date_str or not date_str.strip():
        return timezone.now(), None
    
    # Special handling for ISO format with Z (Zulu/UTC time)
    if 'T' in date_str and date_str.endswith('Z'):
        try:
            # Replace Z with +00:00 for UTC timezone
            iso_date_str = date_str.replace('Z', '+00:00')
            if '.' in iso_date_str:
                # With microseconds: 2023-01-01T14:30:00.123456+00:00
                dt = datetime.strptime(iso_date_str, '%Y-%m-%dT%H:%M:%S.%f%z')
            else:
                # Without microseconds: 2023-01-01T14:30:00+00:00
                dt = datetime.strptime(iso_date_str, '%Y-%m-%dT%H:%M:%S%z')
            return dt, None
        except ValueError:
            pass
    
    # For other ISO formats with T separator
    if 'T' in date_str:
        try:
            # Try parsing with different ISO variations
            formats = [
                '%Y-%m-%dT%H:%M:%S.%f',  # 2023-01-01T14:30:00.123456
                '%Y-%m-%dT%H:%M:%S',     # 2023-01-01T14:30:00
            ]
            
            for fmt in formats:
                try:
                    dt = datetime.strptime(date_str, fmt)
                    if timezone.is_naive(dt):
                        dt = timezone.make_aware(dt)
                    return dt, None
                except ValueError:
                    continue
        except Exception:
            pass
    
    # For common formats
    formats = [
        '%Y-%m-%d %H:%M:%S.%f',  # 2023-01-01 14:30:00.123456
        '%Y-%m-%d %H:%M:%S',     # 2023-01-01 14:30:00
        '%Y-%m-%d',              # 2023-01-01
        '%m/%d/%Y %H:%M:%S',     # 01/01/2023 14:30:00
        '%m/%d/%Y',              # 01/01/2023
        '%d/%m/%Y',              # 31/12/2023
        '%b %d %Y',              # Jan 01 2023
    ]
    
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            # Ensure timezone awareness
            if timezone.is_naive(dt):
                dt = timezone.make_aware(dt)
            return dt, None
        except ValueError:
            continue
    
    # If we reached here, no format matched, try one last approach with dateutil if available
    try:
        # Try with dateutil parser which handles many formats automatically
        from dateutil import parser
        try:
            dt = parser.parse(date_str)
            if timezone.is_naive(dt):
                dt = timezone.make_aware(dt)
            return dt, None
        except Exception:
            pass
    except ImportError:
        # dateutil not available, continue
        pass
    
    # Could not parse the date with any method
    return None, {
        'flag_type': 'PARSE_ERROR',
        'message': f"Could not parse date: '{date_str}'"
    }

def clean_transaction_data(data):
    """
    Clean and parse transaction data without validation/flags.
    
    Args:
        data: Dictionary containing transaction data
        
    Returns:
        dict: Cleaned data dictionary with parsed values
    """
    cleaned_data = {}
    
    # Process description
    description = data.get('description', '').strip()
    cleaned_data['description'] = description
    
    # Process category
    category = data.get('category', '').strip()
    cleaned_data['category'] = category
    
    # Process amount
    amount_str = data.get('amount', '')
    if isinstance(amount_str, (int, float, Decimal)):
        amount_str = str(amount_str)
    amount, _ = parse_amount(amount_str)
    cleaned_data['amount'] = amount
    
    # Process datetime
    date_str = data.get('datetime', '')
    if isinstance(date_str, datetime):
        # Already a datetime object
        if timezone.is_naive(date_str):
            date_str = timezone.make_aware(date_str)
        cleaned_data['datetime'] = date_str
    else:
        dt, _ = parse_datetime(str(date_str) if date_str else '')
        cleaned_data['datetime'] = dt
    
    return cleaned_data

def transaction_validation_flags(transaction, original_data=None):
    """
    Generate validation flags for a transaction object
    
    Args:
        transaction: Transaction object to validate
        original_data: Original unprocessed data for error messages (optional)
        
    Returns:
        list: List of flag dictionaries
    """
    flags = []
    
    # Flag blank descriptions
    if not transaction.description:
        flags.append({
            'flag_type': 'MISSING_DATA',
            'message': "Missing or blank description"
        })
    
    # Flag missing category
    if not transaction.category:
        flags.append({
            'flag_type': 'MISSING_DATA',
            'message': "Missing category"
        })
    
    # Handle parse error flags only if original_data is provided
    if original_data:
        # Add amount parsing error flag if any
        amount_str = original_data.get('amount', '')
        if isinstance(amount_str, (int, float, Decimal)):
            amount_str = str(amount_str)
        _, amount_flag = parse_amount(amount_str)
        if amount_flag:
            flags.append(amount_flag)
        
        # Add datetime parsing error flag if any
        date_str = original_data.get('datetime', '')
        if not isinstance(date_str, datetime):
            _, date_flag = parse_datetime(str(date_str) if date_str else '')
            if date_flag:
                flags.append(date_flag)
    
    return flags

# Cache for storing transaction rules
_rules_cache = {
    'rules': None,
    'last_updated': None
}

def invalidate_rules_cache():
    """Reset the rules cache, forcing a reload on next access."""
    _rules_cache['rules'] = None
    _rules_cache['last_updated'] = None

def get_cached_rules(max_age_seconds=60):
    """
    Get transaction rules from cache or database if cache is outdated.
    
    Args:
        max_age_seconds: Maximum age of cache in seconds before refreshing
        
    Returns:
        List of TransactionRule objects
    """
    from .models import TransactionRule
    import time
    
    current_time = time.time()
    
    # Check if we need to refresh the cache
    if (_rules_cache['rules'] is None or 
        _rules_cache['last_updated'] is None or 
        current_time - _rules_cache['last_updated'] > max_age_seconds):
        
        # Fetch rules from database
        _rules_cache['rules'] = list(TransactionRule.objects.all())
        _rules_cache['last_updated'] = current_time
    
    return _rules_cache['rules']

def apply_transaction_rules(transactions=None, use_cache=True):
    """
    Apply all transaction rules to a list of transactions or queryset.
    
    Args:
        transactions: List of Transaction objects, single Transaction, QuerySet, or None (process all)
        use_cache: Whether to use the rules cache for rules (default: True)
        
    Returns:
        dict: Summary of applied changes (e.g., total transactions updated, flags created)
    """

    # Get all rules (either from cache or directly from database)
    rules = get_cached_rules() if use_cache else list(TransactionRule.objects.all())
    
    # Setup a container for tracking overall changes
    total_result = {
        'updated_count': 0,
        'flag_count': 0,
        'processed_count': 0,
        'rules_applied': len(rules)
    }
    
    # Check if we have any rules to apply
    if not rules:
        return total_result
    
    # Process each rule
    for rule in rules:
        # Apply the rule to all transactions
        rule_result, _ = apply_transaction_rule(rule=rule, transactions=transactions)
        
        # Accumulate results
        total_result['updated_count'] += rule_result['updated_count']
        total_result['flag_count'] += rule_result['flag_count']
        total_result['processed_count'] = rule_result['processed_count']  # Will be the same for all rules
    
    return total_result

def determine_flag_resolvability(flag_data):
    """
    Determine if a transaction flag is resolvable based on its type.
    
    Args:
        flag_data: Dictionary containing flag data
        
    Returns:
        bool: Whether the flag is resolvable
    """
    flag_type = flag_data['flag_type']
    
    # These flag types are resolvable
    if flag_type in ['RULE_MATCH', 'DUPLICATE', 'CUSTOM']:
        return True
    
    # MISSING_DATA flags are resolvable for updates but not for creations
    elif flag_type == 'MISSING_DATA':
        return False
    
    # PARSE_ERROR flags are not resolvable
    return False

def check_duplicates_bulk(transactions, preserve_resolution=True):
    """
    Check for duplicates in bulk for a list or queryset of transactions.
    This efficiently finds and flags potential duplicates using Django ORM.
    
    Args:
        transactions: List or QuerySet of Transaction objects
        preserve_resolution: Whether to preserve resolution status of existing duplicate flags
        
    Returns:
        dict: Mapping of transaction IDs to their duplicate flags
    """
    from .models import Transaction, TransactionFlag
    from django.db import transaction as db_transaction
    from django.db.models import Count
    import time
    import logging
    
    logger = logging.getLogger(__name__)
    
    # For performance debugging
    def log_timing(step_name, start_time):
        duration = time.time() - start_time
        logger.info(f"TIMING: Duplicate detection - {step_name} took {duration:.3f}s")
        return time.time()
    
    # Record initial start time
    total_start = time.time()
    
    # Step 1: Prepare transactions queryset
    step1_start = time.time()
    # Convert list to queryset if needed
    if not hasattr(transactions, 'filter'):
        if not transactions:
            return {}
        transaction_ids = [t.id for t in transactions]
        transaction_queryset = Transaction.objects.filter(id__in=transaction_ids)
    else:
        transaction_queryset = transactions
    
    # Get all transaction IDs that we're checking
    checking_ids = set(transaction_queryset.values_list('id', flat=True))
    
    # Short-circuit if no transactions
    if not checking_ids:
        return {}
    step1_end = log_timing("Step 1: Prepare transactions", step1_start)
    
    # Create a mapping to track duplicate flags by transaction
    duplicate_flags_map = {}
    
    # Step 2: Find duplicate groups, but ONLY for transactions in our checking set
    step2_start = time.time()
    # More targeted approach: find duplicates only among the transactions we're checking
    # and any existing transactions they might duplicate
    
    # Get a list of all descriptions, amounts, and datetimes from our checking set
    checking_data = transaction_queryset.filter(amount__isnull=False).values('description', 'amount', 'datetime')
    
    # If there are no valid transactions to check, return early
    if not checking_data:
        logger.info("No valid transactions to check, returning early")
        return duplicate_flags_map
    
    # Get unique descriptions, amounts, and datetimes from our checking set
    checking_descriptions = set(item['description'] for item in checking_data)
    checking_amounts = set(item['amount'] for item in checking_data)
    checking_datetimes = set(item['datetime'] for item in checking_data)
    
    logger.info(f"Checking {len(checking_descriptions)} descriptions, {len(checking_amounts)} amounts, and {len(checking_datetimes)} datetimes for duplicates")
    
    # Find duplicate groups only for descriptions, amounts, and datetimes in our checking set
    duplicates = (
        Transaction.objects.filter(
            amount__in=checking_amounts,
            description__in=checking_descriptions,
            datetime__in=checking_datetimes,
            amount__isnull=False
        )
        .values('amount', 'description', 'datetime')
        .annotate(count=Count('id'))
        .filter(count__gt=1)
    )
    
    # Log duplicate groups count
    duplicate_count = len(duplicates)
    logger.info(f"Found {duplicate_count} potential duplicate groups")
    
    # Short-circuit if no duplicates
    if not duplicates:
        logger.info("No duplicates found, returning early")
        return duplicate_flags_map
    step2_end = log_timing("Step 2: Find duplicate groups", step2_start)
    
    # Step 3: Fetch matching transactions more efficiently
    step3_start = time.time()
    
    # Prepare a list of (amount, description, datetime) tuples for more targeted filtering
    duplicate_criteria = [(item['amount'], item['description'], item['datetime']) for item in duplicates]
    
    # If too many criteria, chunking the query might be necessary
    if len(duplicate_criteria) > 500:  # Arbitrary threshold for query size
        logger.info(f"Large number of duplicate criteria ({len(duplicate_criteria)}), consider chunking")
    
    # Build a more targeted query using Q objects
    from django.db.models import Q
    query = Q()
    for amount, description, datetime in duplicate_criteria:
        query |= Q(amount=amount, description=description, datetime=datetime)
    
    # Execute the query with the optimized filter
    duplicate_transactions = Transaction.objects.filter(query)
    
    # Count resulting transactions
    duplicate_txn_count = duplicate_transactions.count()
    logger.info(f"Found {duplicate_txn_count} transactions matching duplicate criteria")
    step3_end = log_timing("Step 3: Fetch matching transactions", step3_start)
    
    # Step 4: Group transactions with optimization
    step4_start = time.time()
    
    # Optimize by using a more efficient query to prefetch all data
    duplicate_transactions = list(duplicate_transactions.only('id', 'amount', 'description', 'datetime'))
    
    # Group transactions by amount, description, and datetime
    transaction_groups = {}
    for txn in duplicate_transactions:
        key = (txn.amount, txn.description, txn.datetime)
        if key not in transaction_groups:
            transaction_groups[key] = []
        transaction_groups[key].append(txn)
    
    # Pre-filter groups with only one transaction (can't be duplicates)
    transaction_groups = {k: v for k, v in transaction_groups.items() if len(v) > 1}
    
    # Count group sizes
    group_stats = {}
    total_transactions = 0
    for key, group in transaction_groups.items():
        size = len(group)
        total_transactions += size
        if size not in group_stats:
            group_stats[size] = 0
        group_stats[size] += 1
    
    logger.info(f"Transaction group sizes: {group_stats} (total: {total_transactions} transactions in {len(transaction_groups)} groups)")
    step4_end = log_timing("Step 4: Group transactions", step4_start)
    
    # Step 5: Generate duplicate pairs more efficiently
    step5_start = time.time()
    duplicate_pairs = []
    checked_pairs = set()  # To avoid duplicate work
    
    # Convert checking_ids to a set for faster lookups if it isn't already
    if not isinstance(checking_ids, set):
        checking_ids = set(checking_ids)
    
    # Process each group and generate pairs
    for group in transaction_groups.values():
        # Create pairs with at least one transaction in our checking set
        checking_in_group = [txn for txn in group if txn.id in checking_ids]
        other_in_group = [txn for txn in group if txn.id not in checking_ids]
        
        # Generate pairs where at least one transaction is in our checking set
        for txn1 in checking_in_group:
            # Pairs between checking transactions
            for txn2 in checking_in_group:
                if txn1.id != txn2.id and (txn1.id, txn2.id) not in checked_pairs:
                    duplicate_pairs.append((txn1.id, txn2.id))
                    checked_pairs.add((txn1.id, txn2.id))
            
            # Pairs between checking and other transactions
            for txn2 in other_in_group:
                if (txn1.id, txn2.id) not in checked_pairs:
                    duplicate_pairs.append((txn1.id, txn2.id))
                    checked_pairs.add((txn1.id, txn2.id))
    
    # Short-circuit if no duplicate pairs
    if not duplicate_pairs:
        logger.info("No duplicate pairs found, returning early")
        return duplicate_flags_map
    
    logger.info(f"Generated {len(duplicate_pairs)} duplicate pairs")
    step5_end = log_timing("Step 5: Generate duplicate pairs", step5_start)
    
    # Step 6: Get existing flags
    step6_start = time.time()
    # Get existing duplicate flags if preserving resolution
    existing_flags = {}
    if preserve_resolution:
        existing_duplicate_flags = TransactionFlag.objects.filter(
            transaction_id__in=checking_ids,
            flag_type='DUPLICATE'
        )
        
        for flag in existing_duplicate_flags:
            existing_flags[(flag.transaction_id, flag.duplicates_transaction_id)] = flag
        
        logger.info(f"Found {len(existing_flags)} existing duplicate flags")
    step6_end = log_timing("Step 6: Get existing flags", step6_start)
    
    # Step 7: Create flags
    step7_start = time.time()
    # Create flags for each duplicate pair
    flags_to_create = []
    for txn_id, duplicate_id in duplicate_pairs:
        # Get resolution status from existing flag if applicable
        is_resolved = False
        if preserve_resolution:
            flag = existing_flags.get((txn_id, duplicate_id))
            if flag:
                is_resolved = flag.is_resolved
        
        # Create flag object
        flag_obj = TransactionFlag(
            transaction_id=txn_id,
            duplicates_transaction_id=duplicate_id,
            flag_type='DUPLICATE',
            message=f'Possible duplicate of transaction {duplicate_id}',
            is_resolvable=True,
            is_resolved=is_resolved
        )
        flags_to_create.append(flag_obj)
        
        # Add to flags map
        if txn_id not in duplicate_flags_map:
            duplicate_flags_map[txn_id] = []
            
        duplicate_flags_map[txn_id].append({
            'flag_type': 'DUPLICATE',
            'message': f'Possible duplicate of transaction {duplicate_id}',
            'is_resolvable': True,
            'is_resolved': is_resolved,
            'duplicates_transaction': duplicate_id,
            'created': True
        })
    step7_end = log_timing("Step 7: Create flag objects", step7_start)
    
    # Step 8: Database operations
    step8_start = time.time()
    # Bulk create flags in atomic transaction
    with db_transaction.atomic():
        # Delete existing flags if not preserving resolution
        if not preserve_resolution:
            deleted_count = TransactionFlag.objects.filter(
                transaction_id__in=checking_ids,
                flag_type='DUPLICATE'
            ).delete()[0]
            logger.info(f"Deleted {deleted_count} existing duplicate flags")
        
        # Create new flags
        if flags_to_create:
            created_flags = TransactionFlag.objects.bulk_create(
                flags_to_create,
                ignore_conflicts=True
            )
            logger.info(f"Created {len(created_flags)} new duplicate flags")
    step8_end = log_timing("Step 8: Database operations", step8_start)
    
    # Log total time
    total_time = time.time() - total_start
    logger.info(f"TIMING: Total duplicate detection took {total_time:.3f}s")
    
    return duplicate_flags_map


def clear_transaction_flags_bulk(transactions, flag_types=None, only_unresolved=True):
    """
    Clear flags for multiple transactions in bulk.
    
    Args:
        transactions: List or QuerySet of Transaction objects
        flag_types: List of flag types to clear (default: ['PARSE_ERROR', 'MISSING_DATA', 'RULE_MATCH'])
        only_unresolved: Whether to only clear unresolved flags (default: True)
        
    Returns:
        int: Number of flags deleted
    """
    from .models import TransactionFlag
    
    # Default flag types if none provided
    if flag_types is None:
        flag_types = ['PARSE_ERROR', 'MISSING_DATA', 'RULE_MATCH']
    
    # Build query filter
    query_filter = {
        'transaction__in': transactions,
        'flag_type__in': flag_types
    }
    
    # Add resolved filter if needed
    if only_unresolved:
        query_filter['is_resolved'] = False
    
    # Delete flags in a single operation
    result = TransactionFlag.objects.filter(**query_filter).delete()
    
    # Return count of deleted flags (first item in tuple)
    return result[0] if isinstance(result, tuple) else result

def create_validation_flags_bulk(transactions, original_data_map=None, clear_existing_flags=False):
    """
    Generate and create validation flags for multiple transactions in bulk.
    
    Args:
        transactions: List or QuerySet of Transaction objects
        original_data_map: Dictionary mapping transaction IDs to their original data (optional)
        clear_existing_flags: Whether to clear existing flags before creating new ones (default: False)
        
    Returns:
        dict: Mapping of transaction IDs to their created flags
    """
    from .models import TransactionFlag
    from django.db import transaction as db_transaction
    
    # Default empty map if none provided
    if original_data_map is None:
        original_data_map = {}
        
    # Optionally clear existing flags
    if clear_existing_flags and transactions:
        clear_transaction_flags_bulk(transactions)
    
    # Generate validation flags for all transactions
    all_flag_objects = []
    transaction_flags_map = {}
    
    # Process each transaction
    for transaction in transactions:
        # Get original data if available
        original_data = original_data_map.get(transaction.id)
        
        # Generate validation flags for this transaction
        validation_flags = transaction_validation_flags(transaction, original_data)
        
        # Initialize empty list for this transaction in the map
        if transaction.id not in transaction_flags_map:
            transaction_flags_map[transaction.id] = []
        
        # Create TransactionFlag objects and add to bulk creation list
        for flag_data in validation_flags:
            is_resolvable = determine_flag_resolvability(flag_data)
            
            # Create flag object for bulk creation
            flag_object = TransactionFlag(
                transaction=transaction,
                flag_type=flag_data['flag_type'],
                message=flag_data['message'],
                is_resolvable=is_resolvable,
                is_resolved=False
            )
            
            all_flag_objects.append(flag_object)
            
            # Add to our flags map (deep copy to avoid modification)
            flag_copy = flag_data.copy()
            flag_copy['created'] = True
            transaction_flags_map[transaction.id].append(flag_copy)
    
    # Bulk create all flags in a single database operation
    with db_transaction.atomic():
        if all_flag_objects:
            TransactionFlag.objects.bulk_create(
                all_flag_objects,
                ignore_conflicts=True  # Skip duplicates
            )
    
    return transaction_flags_map

def create_transaction_flags(transaction, flags):
    """
    Create TransactionFlag objects for a transaction
    
    Args:
        transaction: Transaction object
        flags: List of flag dictionaries
        
    Returns:
        list: The flags that were created
    """
    from .models import TransactionFlag
    from django.db.utils import IntegrityError
    
    created_flags = []
    
    for flag_data in flags:
        # Skip flags we already created
        if flag_data.get('created', False):
            continue
            
        # Determine if the flag is resolvable based on its type
        is_resolvable = determine_flag_resolvability(flag_data)
        
        try:
            # Use get_or_create to avoid duplicates
            flag, created = TransactionFlag.objects.get_or_create(
                transaction=transaction,
                flag_type=flag_data['flag_type'],
                message=flag_data['message'],
                defaults={
                    'is_resolvable': is_resolvable,
                    'is_resolved': False
                }
            )
            
            # Only add to created_flags if it was actually created
            if created:
                # Mark this flag as created
                flag_data['created'] = True
                created_flags.append(flag_data)
                
        except IntegrityError:
            # Skip if there's a unique constraint violation
            logger.warning(f"Skipping duplicate flag: {flag_data['flag_type']} - {flag_data['message']}")
            continue
    
    return created_flags

def merge_transaction_update(transaction, data):
    """
    Merge updated data into an existing transaction object.
    
    Args:
        transaction: Existing Transaction object
        data: Dictionary containing update data
        
    Returns:
        dict: Merged data dictionary ready for processing
    """
    # Create a dictionary from the existing transaction
    merged_data = {
        'description': transaction.description,
        'category': transaction.category,
        'amount': transaction.amount,
        'datetime': transaction.datetime
    }
    
    # Handle both dictionary and QueryDict types for data
    if hasattr(data, 'dict'):
        data = data.dict()
    
    # Make a copy of the data so we don't modify the original
    data_copy = data.copy() if hasattr(data, 'copy') else dict(data)
    
    # Extract custom flag if present (not part of transaction data)
    custom_flag = None
    if 'custom_flag' in data_copy:
        custom_flag = data_copy.pop('custom_flag')
    
    # Update merged data with non-empty values from the update
    for key, value in data_copy.items():
        if key in merged_data: # and value not in (None, ''):
            merged_data[key] = value
    
    return merged_data, custom_flag

def process_custom_flag(custom_flag, transaction, all_flags):
    """
    Process a custom flag to be added to a transaction
    
    Args:
        custom_flag: Custom flag data
        transaction: Transaction object
        all_flags: List of all flags
        
    Returns:
        None, modifies all_flags in place
    """
    from .models import TransactionFlag
    from django.db.utils import IntegrityError
    
    if not custom_flag:
        return
        
    # Convert to dictionary if it's a QueryDict or string
    if hasattr(custom_flag, 'dict'):
        custom_flag = custom_flag.dict()
    elif isinstance(custom_flag, str):
        import json
        try:
            custom_flag = json.loads(custom_flag)
        except json.JSONDecodeError:
            custom_flag = {'message': custom_flag}
    
    flag_type = custom_flag.get('flag_type', 'CUSTOM')
    message = custom_flag.get('message', '')
    is_resolvable = custom_flag.get('is_resolvable', True)
    
    if message:  # Only create if there's a message
        try:
            # Use get_or_create to handle duplicates
            flag, created = TransactionFlag.objects.get_or_create(
                transaction=transaction,
                flag_type=flag_type,
                message=message,
                defaults={
                    'is_resolvable': is_resolvable,
                    'is_resolved': False
                }
            )
            
            # Only add to flags list if it was created
            if created:
                # Add to our list of flags to return
                all_flags.append({
                    'flag_type': flag_type,
                    'message': message,
                    'is_resolvable': is_resolvable,
                    'created': True
                })
        except IntegrityError:
            # Log but otherwise ignore duplicates
            logger.warning(f"Skipping duplicate custom flag: {flag_type} - {message}")
            pass

# Add the new apply_transaction_rule function
def apply_transaction_rule(rule_id=None, rule=None, transactions=None):
    """
    Apply a TransactionRule to a single transaction or a queryset of transactions.
    
    Args:
        rule_id (int, optional): ID of the TransactionRule to apply.
        rule (TransactionRule, optional): TransactionRule object to apply directly.
        transactions (Transaction, QuerySet, or None): Single transaction, queryset, or None (process all).
    
    Returns:
        dict: Summary of applied changes (e.g., number of transactions updated).
    """
    from django.core.exceptions import ValidationError
    from .models import TransactionRule, Transaction, TransactionFlag
    
    # Get the rule - either from the parameter or fetch by ID
    if rule is None and rule_id is None:
        raise ValidationError("Either rule or rule_id must be provided")
    
    if rule is None:
        try:
            # Fetch the rule
            rule = TransactionRule.objects.get(id=rule_id)
        except TransactionRule.DoesNotExist:
            raise ValidationError(f"TransactionRule with ID {rule_id} does not exist.")

    # Prepare the transactions queryset
    if transactions is None:
        queryset = Transaction.objects.all()
    elif isinstance(transactions, Transaction):
        queryset = Transaction.objects.filter(id=transactions.id)
    else:
        queryset = transactions

    # Apply filter condition
    try:
        if rule.filter_condition:
            filtered_queryset = queryset.filter(**rule.filter_condition)
        else:
            filtered_queryset = queryset.all()
    except Exception as e:
        raise ValidationError(f"Invalid filter condition: {str(e)}")
    
    # Track changes
    update_count = 0
    flag_count = 0
    
    # Process in batches for better performance
    batch_size = 1000
    tids = []
    for i in range(0, filtered_queryset.count(), batch_size):
        batch = filtered_queryset[i:i+batch_size]
        
        # Process rule actions
        for transaction in batch:
            modified = False

            tids.append(transaction.id)
            # Apply category if rule has one and transaction doesn't
            if rule.category and not transaction.category:
                transaction.category = rule.category
                modified = True
            
            # Save if modified
            if modified:
                transaction.save()
                update_count += 1
            
            # Add flag if rule has one
            if rule.flag_message:
                # Check if this flag already exists to avoid duplicates
                flag, created = TransactionFlag.objects.get_or_create(
                    transaction=transaction,
                    flag_type='RULE_MATCH',
                    message=rule.flag_message,
                    defaults={'is_resolvable': True, 'is_resolved': False}
                )
                if created:
                    flag_count += 1
                # If flag already existed, we preserve its is_resolved status
    
    # Return summary of changes
    return {
        'rule_id': rule.id,
        'updated_count': update_count,
        'flag_count': flag_count,
        'processed_count': filtered_queryset.count(),
    }, Transaction.objects.filter(id__in=tids)

def create_clean_transactions(data_list):
    """
    Create transactions in bulk from a list of data dictionaries.
    
    Args:
        data_list: List of dictionaries containing transaction data
        
    Returns:
        tuple: (list of created Transaction objects, list of cleaned data dictionaries, list of original data)
    """
    from .models import Transaction
    
    # Process each data item
    cleaned_data_list = []
    valid_original_data = []
    
    for data in data_list:
        # Clean the data
        cleaned_data = clean_transaction_data(data)
        
        # Validate that we have at least some valid data
        if cleaned_data['amount'] is None and not cleaned_data['description'] and not cleaned_data['category']:
            continue  # Skip invalid data
        
        # Keep track of cleaned data and original data for valid entries
        cleaned_data_list.append(cleaned_data)
        valid_original_data.append(data)
    
    # Bulk create transactions for better performance
    transactions_to_create = [Transaction(**clean_data) for clean_data in cleaned_data_list]
    created_transactions = Transaction.objects.bulk_create(transactions_to_create)
    
    return created_transactions, cleaned_data_list, valid_original_data

def create_transactions_with_flags_bulk(data_list):
    """
    Create multiple transactions from a list of data, apply rules, and handle flags in bulk.
    
    Args:
        data_list: List of dictionaries containing transaction data
        
    Returns:
        tuple: (list of transaction objects, dict mapping transaction IDs to their flags)
    """
    from .models import Transaction, TransactionFlag
    from django.db import transaction as db_transaction
    import time
    import logging
    
    logger = logging.getLogger(__name__)
    
    # For performance debugging
    def log_timing(step_name, start_time):
        duration = time.time() - start_time
        logger.info(f"TIMING: {step_name} took {duration:.3f}s")
        return time.time()
    
    # Record initial start time
    total_start = time.time()
    
    # Handle empty list case
    if not data_list:
        return [], {}
    
    logger.info(f"Starting bulk create for {len(data_list)} transactions")
    
    # Step 1: Bulk create transactions with cleaned data
    step1_start = time.time()
    created_transactions, cleaned_data_list, original_data_list = create_clean_transactions(data_list)
    step1_end = log_timing("Step 1: Bulk create transactions", step1_start)
    
    if not created_transactions:
        return [], {}
    
    logger.info(f"Created {len(created_transactions)} transactions")
    
    # Step 2: Apply transaction rules to all new transactions
    step2_start = time.time()
    from django.db.models import QuerySet
    
    # If it's a list, convert it to a queryset for compatibility with apply_transaction_rules
    if created_transactions:
        transaction_ids = [t.id for t in created_transactions]
        # Create a queryset from the transaction IDs
        transaction_queryset = Transaction.objects.filter(id__in=transaction_ids)
        apply_transaction_rules(transaction_queryset)
    step2_end = log_timing("Step 2: Apply transaction rules", step2_start)
    
    # Need to refresh transactions from the database to get their updated values and IDs
    step3_start = time.time()
    transaction_ids = [t.id for t in created_transactions]
    refreshed_transactions = list(Transaction.objects.filter(id__in=transaction_ids))
    step3_end = log_timing("Step 3: Refresh transactions", step3_start)
    
    # Step 4: Create a mapping of transaction ID to original data
    step4_start = time.time()
    original_data_map = {}
    for i, transaction in enumerate(refreshed_transactions):
        if i < len(original_data_list):
            original_data_map[transaction.id] = original_data_list[i]
    step4_end = log_timing("Step 4: Create original data map", step4_start)
    
    # Step 5: Use the bulk validation flag function to create validation flags
    step5_start = time.time()
    # For new transactions, we don't need to clear existing flags
    validation_flags_map = create_validation_flags_bulk(refreshed_transactions, original_data_map, clear_existing_flags=False)
    step5_end = log_timing("Step 5: Create validation flags", step5_start)
    
    # Initialize transaction_flags_map with validation flags
    transaction_flags_map = validation_flags_map
    
    # Step 6: Get rule flags for each transaction
    step6_start = time.time()
    rule_flags_by_txn = {}
    
    # Use a single query to get all rule flags
    all_rule_flags = TransactionFlag.objects.filter(
        transaction_id__in=transaction_ids,
        flag_type='RULE_MATCH'
    ).select_related('transaction')
    
    # Group flags by transaction
    for flag in all_rule_flags:
        txn_id = flag.transaction_id
        if txn_id not in rule_flags_by_txn:
            rule_flags_by_txn[txn_id] = []
        
        rule_flags_by_txn[txn_id].append({
            'flag_type': flag.flag_type,
            'message': flag.message,
            'is_resolvable': flag.is_resolvable,
            'created': True
        })
    
    # Add rule flags to transaction_flags_map
    for txn_id, flags in rule_flags_by_txn.items():
        if txn_id in transaction_flags_map:
            transaction_flags_map[txn_id].extend(flags)
        else:
            transaction_flags_map[txn_id] = flags
    
    step6_end = log_timing("Step 6: Get rule flags", step6_start)
    
    # Step 7: Check for and create duplicate flags
    step7_start = time.time()
    duplicate_flags_map = check_duplicates_bulk(refreshed_transactions)
    step7_end = log_timing("Step 7: Check duplicates", step7_start)
    
    # Step 8: Merge duplicate flags into our transaction flags map
    step8_start = time.time()
    for txn_id, flags in duplicate_flags_map.items():
        if txn_id in transaction_flags_map:
            transaction_flags_map[txn_id].extend(flags)
        else:
            transaction_flags_map[txn_id] = flags
    step8_end = log_timing("Step 8: Merge duplicate flags", step8_start)
    
    # Log overall time
    total_time = time.time() - total_start
    logger.info(f"TIMING: Total bulk creation took {total_time:.3f}s")
    
    # Return transactions and their flags
    return refreshed_transactions, transaction_flags_map

def create_transaction_with_flags(data):
    """
    Create a transaction from data, apply rules, and handle flags.
    
    Args:
        data: Dictionary containing transaction data
        
    Returns:
        tuple: (transaction object, list of flag dictionaries)
    """
    from .models import Transaction, TransactionFlag

    # Clean the data
    cleaned_data = clean_transaction_data(data)
    
    # Validate that we have at least some valid data
    if cleaned_data['amount'] is None and not cleaned_data['description'] and not cleaned_data['category']:
        raise ValueError("Transaction must have at least a description, category, or valid amount")
    
    # Create transaction first (so it exists in the database)
    transaction = Transaction(**cleaned_data)
    transaction.save()

    # Apply transaction rules to just this transaction
    apply_transaction_rules(transaction)
    # Refresh transaction with any changes made by rules
    transaction.refresh_from_db()

    # Get validation flags from the transaction (after rules have been applied) and original data
    validation_flags = transaction_validation_flags(transaction, data)
    
    # Create validation flags first
    create_transaction_flags(transaction, validation_flags)

    # Get any rule flags that were created (for returning to the caller)
    rule_flags = []
    for flag in transaction.flags.filter(flag_type='RULE_MATCH'):
        rule_flags.append({
            'flag_type': flag.flag_type,
            'message': flag.message,
            'is_resolvable': flag.is_resolvable,
            'created': True
        })
    
    # Check for duplicates using our bulk function (for a single transaction)
    duplicate_flags_map = check_duplicates_bulk([transaction])
    
    # Add duplicate flags to our flags list
    duplicate_flags = duplicate_flags_map.get(transaction.id, [])
    
    # Combine all flags
    all_flags = validation_flags + rule_flags + duplicate_flags
    
    return transaction, all_flags

def update_transaction_with_flags(transaction, data):
    """
    Update an existing transaction with new data, apply rules, and handle flags.
    
    Args:
        transaction: Existing Transaction object
        data: Dictionary containing new transaction data
        
    Returns:
        tuple: (updated transaction object, list of flag dictionaries)
    """
    from .models import Transaction, TransactionFlag
    
    # Merge the existing transaction data with the update
    merged_data, custom_flag = merge_transaction_update(transaction, data)
    
    # Clean the merged data
    cleaned_data = clean_transaction_data(merged_data)
    
    # Clear existing unresolved parse error, missing data, rule match, and duplicate flags
    # Keep custom flags and resolved flags intact
    clear_transaction_flags_bulk([transaction], ['PARSE_ERROR', 'MISSING_DATA', 'RULE_MATCH', 'DUPLICATE'], only_unresolved=True)
    
    # Also clear duplicate flags that point to this transaction from other transactions
    from .models import TransactionFlag
    TransactionFlag.objects.filter(
        duplicates_transaction=transaction,
        flag_type='DUPLICATE',
        is_resolved=False
    ).delete()
    
    # Update transaction with the cleaned data
    for key, value in cleaned_data.items():
        setattr(transaction, key, value)
    transaction.save()
    
    # Apply transaction rules to just this transaction
    apply_transaction_rules(transaction)
    # Refresh transaction with any changes made by rules
    transaction.refresh_from_db()

    # Generate validation flags after rules have been applied
    validation_flags = transaction_validation_flags(transaction, merged_data)
    
    # Create validation flags first
    create_transaction_flags(transaction, validation_flags)

    # Get any rule flags that were created (for returning to the caller)
    rule_flags = []
    for flag in transaction.flags.filter(flag_type='RULE_MATCH'):
        rule_flags.append({
            'flag_type': flag.flag_type,
            'message': flag.message,
            'is_resolvable': flag.is_resolvable,
            'created': True
        })
    
    # Check for duplicates using our bulk function (for a single transaction)
    duplicate_flags_map = check_duplicates_bulk([transaction])
    
    # Add duplicate flags to our flags list
    duplicate_flags = duplicate_flags_map.get(transaction.id, [])
    
    # Combine all flags for return value
    all_flags = validation_flags + rule_flags + duplicate_flags
    
    # Process custom flag if provided
    process_custom_flag(custom_flag, transaction, all_flags)
    
    return transaction, all_flags
