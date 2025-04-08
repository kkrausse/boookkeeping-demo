"""Utility functions for transaction processing."""
from datetime import datetime
from decimal import Decimal, InvalidOperation
from django.utils import timezone

def parse_amount(amount_str):
    """
    Parse an amount string into a Decimal, handling errors gracefully.
    
    Args:
        amount_str: String representation of an amount
        
    Returns:
        tuple: (Decimal amount, flag dict or None)
    """
    try:
        if amount_str and amount_str.strip():
            return Decimal(amount_str), None
        else:
            return Decimal('0.00'), {
                'flag_type': 'PARSE_ERROR',
                'message': "Missing or invalid amount value"
            }
    except (ValueError, InvalidOperation):
        return Decimal('0.00'), {
            'flag_type': 'PARSE_ERROR',
            'message': f"Could not parse amount: '{amount_str}'"
        }

def parse_datetime(date_str):
    """
    Parse a datetime string, trying multiple formats.
    
    Args:
        date_str: String representation of a date/time
        
    Returns:
        tuple: (datetime object or None, flag dict or None)
    """
    if not date_str or not date_str.strip():
        return timezone.now(), None
        
    formats = [
        '%Y-%m-%d %H:%M:%S',  # 2023-01-01 14:30:00
        '%Y-%m-%d',           # 2023-01-01
        '%m/%d/%Y %H:%M:%S',  # 01/01/2023 14:30:00
        '%m/%d/%Y',           # 01/01/2023
        '%d/%m/%Y',           # 31/12/2023
        '%b %d %Y',           # Jan 01 2023
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
    
    # If we reached here, no format matched
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
    cleaned_data['description'] = data.get('description', '').strip()
    
    # Process category
    cleaned_data['category'] = data.get('category', '').strip()
    
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
    if not cleaned_data['description'] and cleaned_data['amount'] == Decimal('0.00'):
        raise ValueError("Both description and amount are missing or invalid")
    
    return cleaned_data, flags

def create_transaction_with_flags(data):
    """
    Create a transaction from data and handle flags.
    
    Args:
        data: Dictionary containing transaction data
        
    Returns:
        tuple: (transaction object, list of flag dictionaries)
    """
    from .models import Transaction, TransactionFlag
    
    # Validate and clean data
    cleaned_data, flags = validate_transaction_data(data)
    
    # Create transaction
    transaction = Transaction(**cleaned_data)
    transaction.save()
    
    # Create flags
    for flag_data in flags:
        TransactionFlag.objects.create(
            transaction=transaction,
            flag_type=flag_data['flag_type'],
            message=flag_data['message']
        )
    
    return transaction, flags

def update_transaction_with_flags(transaction, data):
    """
    Update an existing transaction with new data and handle flags.
    
    Args:
        transaction: Existing Transaction object
        data: Dictionary containing new transaction data
        
    Returns:
        tuple: (updated transaction object, list of flag dictionaries)
    """
    from .models import TransactionFlag
    
    # Validate and clean data
    cleaned_data, flags = validate_transaction_data(data)
    
    # Clear existing parse error flags
    TransactionFlag.objects.filter(
        transaction=transaction,
        flag_type='PARSE_ERROR'
    ).delete()
    
    # Update transaction
    for key, value in cleaned_data.items():
        setattr(transaction, key, value)
    transaction.save()
    
    # Create new flags
    for flag_data in flags:
        TransactionFlag.objects.create(
            transaction=transaction,
            flag_type=flag_data['flag_type'],
            message=flag_data['message']
        )
    
    return transaction, flags
