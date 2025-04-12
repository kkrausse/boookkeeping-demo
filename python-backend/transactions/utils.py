"""Utility functions for transaction processing."""
from datetime import datetime
from decimal import Decimal, InvalidOperation
from django.utils import timezone

import logging
import time

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

def transaction_validation_flags(cleaned_data, original_data):
    """
    Generate validation flags for transaction data
    
    Args:
        cleaned_data: Dictionary containing parsed/cleaned data
        original_data: Original unprocessed data for error messages
        
    Returns:
        list: List of flag dictionaries
    """
    flags = []
    
    # Flag blank descriptions
    if not cleaned_data.get('description'):
        flags.append({
            'flag_type': 'MISSING_DATA',
            'message': "Missing or blank description"
        })
    
    # Flag missing category
    if not cleaned_data.get('category'):
        flags.append({
            'flag_type': 'MISSING_DATA',
            'message': "Missing category"
        })
    
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

def apply_transaction_rules(transaction_data, use_cache=True):
    """
    Apply transaction rules to a transaction data dictionary.
    
    Args:
        transaction_data: Dictionary containing transaction data
        use_cache: Whether to use the rules cache (default: True)
        
    Returns:
        tuple: (modified transaction data, list of applied rule flags)
    """
    from .models import TransactionRule
    
    applied_rule_flags = []
    
    # Get rules (either from cache or directly from the database)
    rules = get_cached_rules() if use_cache else list(TransactionRule.objects.all())
    
    for rule in rules:
        rule_matches = True
        
        # Skip rules with no filter condition
        if not rule.filter_condition:
            continue
            
        # Check each filter condition
        for key, value in rule.filter_condition.items():
            # Parse field and operator from Django-style filter key
            parts = key.split('__')
            field = parts[0]
            operator = parts[1] if len(parts) > 1 else 'exact'
            
            # Get the field value from transaction data
            field_value = transaction_data.get(field)
            
            # Skip if field isn't in transaction data
            if field_value is None:
                rule_matches = False
                break
                
            # Convert amount to Decimal for comparison if needed
            if field == 'amount' and isinstance(field_value, str):
                try:
                    field_value = Decimal(field_value)
                except (InvalidOperation, ValueError):
                    rule_matches = False
                    break
            
            # Apply appropriate comparison operator
            if operator == 'icontains':
                # Case-insensitive contains
                if not (isinstance(field_value, str) and 
                       isinstance(value, str) and 
                       value.lower() in field_value.lower()):
                    rule_matches = False
                    break
            elif operator == 'contains':
                # Case-sensitive contains
                if not (isinstance(field_value, str) and 
                       isinstance(value, str) and 
                       value in field_value):
                    rule_matches = False
                    break
            elif operator == 'gt':
                # Greater than
                if not (field_value > value):
                    rule_matches = False
                    break
            elif operator == 'lt':
                # Less than
                if not (field_value < value):
                    rule_matches = False
                    break
            elif operator == 'gte':
                # Greater than or equal
                if not (field_value >= value):
                    rule_matches = False
                    break
            elif operator == 'lte':
                # Less than or equal
                if not (field_value <= value):
                    rule_matches = False
                    break
            elif operator == 'exact' or operator == '':
                # Exact match
                if not (field_value == value):
                    rule_matches = False
                    break
            else:
                # Unsupported operator
                rule_matches = False
                break
        
        # Apply rule actions if all conditions match
        if rule_matches:
            # Apply category if rule has one and transaction doesn't already have a category
            if rule.category and not transaction_data.get('category'):
                transaction_data['category'] = rule.category
                
            # Add flag for rule match
            if rule.flag_message:
                applied_rule_flags.append({
                    'flag_type': 'RULE_MATCH',
                    'message': rule.flag_message
                })
    
    return transaction_data, applied_rule_flags

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
    
    created_flags = []
    
    for flag_data in flags:
        # Skip flags we already created
        if flag_data.get('created', False):
            continue
            
        # Determine if the flag is resolvable based on its type
        is_resolvable = determine_flag_resolvability(flag_data)
            
        TransactionFlag.objects.create(
            transaction=transaction,
            flag_type=flag_data['flag_type'],
            message=flag_data['message'],
            is_resolvable=is_resolvable
        )
        
        # Mark this flag as created
        flag_data['created'] = True
        created_flags.append(flag_data)
    
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
        if key in merged_data and value not in (None, ''):
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
        TransactionFlag.objects.create(
            transaction=transaction,
            flag_type=flag_type,
            message=message,
            is_resolvable=is_resolvable
        )
        
        # Add to our list of flags to return
        all_flags.append({
            'flag_type': flag_type,
            'message': message,
            'is_resolvable': is_resolvable,
            'created': True
        })

# Add the new apply_transaction_rule function
def apply_transaction_rule(rule_id, transactions=None):
    """
    Apply a TransactionRule to a single transaction or a queryset of transactions.
    
    Args:
        rule_id (int): ID of the TransactionRule to apply.
        transactions (Transaction, QuerySet, or None): Single transaction, queryset, or None (process all).
    
    Returns:
        dict: Summary of applied changes (e.g., number of transactions updated).
    """
    from django.core.exceptions import ValidationError
    from .models import TransactionRule, Transaction, TransactionFlag
    
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
    for i in range(0, filtered_queryset.count(), batch_size):
        batch = filtered_queryset[i:i+batch_size]
        
        # Process rule actions
        for transaction in batch:
            modified = False
            
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
                    defaults={'is_resolvable': True}
                )
                if created:
                    flag_count += 1
    
    # Return summary of changes
    return {
        'rule_id': rule_id,
        'updated_count': update_count,
        'flag_count': flag_count,
        'processed_count': filtered_queryset.count()
    }

def validate_transaction_data(data):
    """
    Validate transaction data and generate appropriate flags.
    This function is kept for backward compatibility.
    
    Args:
        data: Dictionary containing transaction data
        
    Returns:
        tuple: (cleaned_data, list of flag dictionaries)
    """
    cleaned_data = clean_transaction_data(data)
    flags = transaction_validation_flags(cleaned_data, data)
    
    # Validate that we have at least some valid data
    if cleaned_data['amount'] is None and not cleaned_data['description'] and not cleaned_data['category']:
        raise ValueError("Transaction must have at least a description, category, or valid amount")
    
    return cleaned_data, flags

def create_transaction_with_flags(data):
    """
    Create a transaction from data, apply rules, and handle flags.
    
    Args:
        data: Dictionary containing transaction data
        
    Returns:
        tuple: (transaction object, list of flag dictionaries)
    """
    from .models import Transaction

    # Clean the data
    cleaned_data = clean_transaction_data(data)
    
    # Apply transaction rules 
    cleaned_data, rule_flags = apply_transaction_rules(cleaned_data)
    
    # Generate validation flags after rule application
    validation_flags = transaction_validation_flags(cleaned_data, data)
    
    # Validate that we have at least some valid data
    if cleaned_data['amount'] is None and not cleaned_data['description'] and not cleaned_data['category']:
        raise ValueError("Transaction must have at least a description, category, or valid amount")
    
    # Create transaction
    transaction = Transaction(**cleaned_data)
    transaction.save()
    
    # Combine all flags
    all_flags = validation_flags + rule_flags
    
    # Create flags
    create_transaction_flags(transaction, all_flags)
    
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
    from .models import TransactionFlag
    
    # Merge the existing transaction data with the update
    merged_data, custom_flag = merge_transaction_update(transaction, data)
    
    # Clean the merged data
    cleaned_data = clean_transaction_data(merged_data)
    
    # Apply transaction rules
    cleaned_data, rule_flags = apply_transaction_rules(cleaned_data)
    
    # Generate validation flags after rule application
    validation_flags = transaction_validation_flags(cleaned_data, merged_data)
    
    # Clear existing parse error, missing data, and rule match flags
    # Keep custom flags intact
    TransactionFlag.objects.filter(
        transaction=transaction,
        flag_type__in=['PARSE_ERROR', 'MISSING_DATA', 'RULE_MATCH']
    ).delete()
    
    # Store old data before updating for duplicate checking
    old_description = transaction.description
    old_amount = transaction.amount
    old_category = transaction.category
    
    # Update transaction
    for key, value in cleaned_data.items():
        setattr(transaction, key, value)
    transaction.save()
    
    # The post_save signal handler will automatically update all duplicate flags
    
    # Combine all flags
    all_flags = validation_flags + rule_flags
    
    # Process custom flag if provided
    process_custom_flag(custom_flag, transaction, all_flags)
    
    # Create flags
    create_transaction_flags(transaction, all_flags)
    
    return transaction, all_flags
