"""Utility functions for transaction processing."""
from datetime import datetime
from decimal import Decimal, InvalidOperation
from django.utils import timezone

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
    return timezone.now(), {
        'flag_type': 'PARSE_ERROR',
        'message': f"Could not parse date: '{date_str}'"
    }

def validate_transaction_data(data):
    """
    Validate transaction data and generate appropriate flags.
    
    Args:
        data: Dictionary containing transaction data
        
    Returns:
        tuple: (cleaned_data, list of flag dictionaries)
    """
    flags = []
    cleaned_data = {}
    
    # Process description
    description = data.get('description', '').strip()
    cleaned_data['description'] = description
    
    # Flag blank descriptions
    if not description:
        flags.append({
            'flag_type': 'MISSING_DATA',
            'message': "Missing or blank description"
        })
    
    # Process category
    category = data.get('category', '').strip()
    cleaned_data['category'] = category
    
    # Flag missing categories
    if not category:
        flags.append({
            'flag_type': 'MISSING_DATA',
            'message': "Missing category"
        })
    
    # Process amount
    amount_str = data.get('amount', '')
    if isinstance(amount_str, (int, float, Decimal)):
        amount_str = str(amount_str)
    amount, amount_flag = parse_amount(amount_str)
    cleaned_data['amount'] = amount
    if amount_flag:
        flags.append(amount_flag)
    
    # Process datetime
    date_str = data.get('datetime', '')
    if isinstance(date_str, datetime):
        # Already a datetime object
        if timezone.is_naive(date_str):
            date_str = timezone.make_aware(date_str)
        cleaned_data['datetime'] = date_str
    else:
        dt, date_flag = parse_datetime(str(date_str) if date_str else '')
        cleaned_data['datetime'] = dt
        if date_flag:
            flags.append(date_flag)
    
    # Validate that we have at least some valid data
    if cleaned_data['amount'] is None and not cleaned_data['description'] and not cleaned_data['category']:
        raise ValueError("Transaction must have at least a description, category, or valid amount")
    
    return cleaned_data, flags

def apply_transaction_rules(transaction_data):
    """
    Apply transaction rules to a transaction data dictionary.
    
    Args:
        transaction_data: Dictionary containing transaction data
        
    Returns:
        tuple: (modified transaction data, list of applied rule flags)
    """
    from .models import TransactionRule
    
    applied_rule_flags = []
    
    # Get all active rules
    rules = TransactionRule.objects.all()
    
    for rule in rules:
        rule_matches = True
        
        # Check description filter
        if rule.filter_description and transaction_data.get('description'):
            if rule.filter_description.lower() not in transaction_data['description'].lower():
                rule_matches = False
                
        # Check amount filter
        if rule.filter_amount_value is not None and rule.filter_amount_comparison and transaction_data.get('amount') is not None:
            amount = transaction_data['amount']
            if isinstance(amount, str):
                try:
                    amount = Decimal(amount)
                except (InvalidOperation, ValueError):
                    rule_matches = False
            
            if rule_matches:
                if rule.filter_amount_comparison == 'above' and not (amount > rule.filter_amount_value):
                    rule_matches = False
                elif rule.filter_amount_comparison == 'below' and not (amount < rule.filter_amount_value):
                    rule_matches = False
                elif rule.filter_amount_comparison == 'equal' and not (amount == rule.filter_amount_value):
                    rule_matches = False
        
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

def create_transaction_with_flags(data):
    """
    Create a transaction from data, apply rules, and handle flags.
    
    Args:
        data: Dictionary containing transaction data
        
    Returns:
        tuple: (transaction object, list of flag dictionaries)
    """
    from .models import Transaction, TransactionFlag
    
    # Validate and clean data
    cleaned_data, validation_flags = validate_transaction_data(data)
    
    # Apply transaction rules before creating flags
    # This ensures rules are applied before flag checks (like duplicates)
    cleaned_data, rule_flags = apply_transaction_rules(cleaned_data)
    
    # Create transaction
    transaction = Transaction(**cleaned_data)
    transaction.save()
    
    # Combine all flags
    all_flags = validation_flags + rule_flags
    
    # Create flags
    for flag_data in all_flags:
        TransactionFlag.objects.create(
            transaction=transaction,
            flag_type=flag_data['flag_type'],
            message=flag_data['message']
        )
    
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
    
    # Validate and clean data
    cleaned_data, validation_flags = validate_transaction_data(data)
    
    # Preserve existing category if one exists and no new category provided
    if transaction.category and not cleaned_data.get('category'):
        cleaned_data['category'] = transaction.category
    
    # Apply transaction rules
    cleaned_data, rule_flags = apply_transaction_rules(cleaned_data)
    
    # Clear existing parse error, missing data, and rule match flags
    TransactionFlag.objects.filter(
        transaction=transaction,
        flag_type__in=['PARSE_ERROR', 'MISSING_DATA', 'RULE_MATCH']
    ).delete()
    
    # Update transaction
    for key, value in cleaned_data.items():
        setattr(transaction, key, value)
    transaction.save()
    
    # Combine all flags
    all_flags = validation_flags + rule_flags
    
    # Create new flags
    for flag_data in all_flags:
        TransactionFlag.objects.create(
            transaction=transaction,
            flag_type=flag_data['flag_type'],
            message=flag_data['message']
        )
    
    return transaction, all_flags
