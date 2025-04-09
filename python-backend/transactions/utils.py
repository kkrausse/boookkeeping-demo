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
    
    # Note: We don't flag missing categories here anymore.
    # This will be done after rules are applied, if still needed.
    
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
    
    # Now check for missing category AFTER rules have been applied
    # This way, if a rule provided a category, we won't flag it as missing
    if not cleaned_data.get('category'):
        missing_category_flag = {
            'flag_type': 'MISSING_DATA',
            'message': "Missing category"
        }
        validation_flags.append(missing_category_flag)
    
    # Create transaction
    transaction = Transaction(**cleaned_data)
    transaction.save()
    
    # Combine all flags
    all_flags = validation_flags + rule_flags
    
    # Create flags
    for flag_data in all_flags:
        # Determine if the flag is resolvable based on its type
        is_resolvable = False
        
        # RULE_MATCH flags (from transaction rules) are resolvable
        if flag_data['flag_type'] == 'RULE_MATCH':
            is_resolvable = True
        
        # MISSING_DATA flags are resolvable
        elif flag_data['flag_type'] == 'MISSING_DATA':
            is_resolvable = False
        
        # DUPLICATE flags are resolvable
        elif flag_data['flag_type'] == 'DUPLICATE':
            is_resolvable = True
            
        # CUSTOM flags are resolvable
        elif flag_data['flag_type'] == 'CUSTOM':
            is_resolvable = True
        
        # PARSE_ERROR flags are NOT resolvable (default is False)
            
        TransactionFlag.objects.create(
            transaction=transaction,
            flag_type=flag_data['flag_type'],
            message=flag_data['message'],
            is_resolvable=is_resolvable
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
    from .models import TransactionFlag, Transaction
    
    # Handle both dictionary and QueryDict types for data
    if hasattr(data, 'dict'):
        data = data.dict()
    
    # Make a copy of the data so we don't modify the original
    data_copy = data.copy() if hasattr(data, 'copy') else dict(data)
    
    # Check for custom flag in the data
    custom_flag = None
    if 'custom_flag' in data_copy:
        custom_flag = data_copy.pop('custom_flag')
    
    # Validate and clean data
    cleaned_data, validation_flags = validate_transaction_data(data_copy)
    
    # For PATCH requests, preserve existing values if not provided
    if transaction.description and not cleaned_data.get('description'):
        cleaned_data['description'] = transaction.description
    
    if transaction.category and not cleaned_data.get('category'):
        cleaned_data['category'] = transaction.category
    
    if transaction.amount is not None and cleaned_data.get('amount') is None:
        cleaned_data['amount'] = transaction.amount
    
    if transaction.datetime and not cleaned_data.get('datetime'):
        cleaned_data['datetime'] = transaction.datetime
    
    # Apply transaction rules
    cleaned_data, rule_flags = apply_transaction_rules(cleaned_data)
    
    # Now check for missing category AFTER rules have been applied
    # This way, if a rule provided a category, we won't flag it as missing
    if not cleaned_data.get('category'):
        missing_category_flag = {
            'flag_type': 'MISSING_DATA',
            'message': "Missing category"
        }
        validation_flags.append(missing_category_flag)
    
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
    
    # Check for transactions that have this transaction as a duplicate
    # If the transaction data has changed, we need to re-evaluate those flags
    if (old_description != transaction.description or 
        old_amount != transaction.amount or 
        old_category != transaction.category):
        
        # Find flags that mark other transactions as duplicates of this one
        referring_flags = TransactionFlag.objects.filter(
            duplicates_transaction=transaction,
            flag_type='DUPLICATE'
        )
        
        # For each referring flag, re-check if it's still a duplicate
        for flag in referring_flags:
            other_transaction = flag.transaction
            
            # Check if other transaction is still a duplicate of this one
            if (other_transaction.description == transaction.description and
                other_transaction.amount == transaction.amount):
                # Still a duplicate, keep the flag
                pass
            else:
                # No longer a duplicate, remove the flag
                flag.delete()
    
    # Combine all flags
    all_flags = validation_flags + rule_flags
    
    # Add the custom flag if provided
    if custom_flag:
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
    
    # Create new flags
    for flag_data in all_flags:
        if flag_data.get('created', False):
            # Skip flags we already created (like custom flags)
            continue
            
        # Determine if the flag is resolvable based on its type
        is_resolvable = False
        
        # RULE_MATCH flags (from transaction rules) are resolvable
        if flag_data['flag_type'] == 'RULE_MATCH':
            is_resolvable = True
        
        # MISSING_DATA flags are resolvable
        elif flag_data['flag_type'] == 'MISSING_DATA':
            is_resolvable = True
        
        # DUPLICATE flags are resolvable
        elif flag_data['flag_type'] == 'DUPLICATE':
            is_resolvable = True
        
        # CUSTOM flags are resolvable
        elif flag_data['flag_type'] == 'CUSTOM':
            is_resolvable = True
        
        # PARSE_ERROR flags are NOT resolvable (default is False)
            
        TransactionFlag.objects.create(
            transaction=transaction,
            flag_type=flag_data['flag_type'],
            message=flag_data['message'],
            is_resolvable=is_resolvable
        )
        
        # Mark this flag as created so we don't create it again
        flag_data['created'] = True
    
    return transaction, all_flags
