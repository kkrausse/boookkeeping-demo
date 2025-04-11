from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from transactions.models import Transaction, TransactionFlag

class TestDuplicateFlags(TestCase):
    def setUp(self):
        self.transaction_data = {
            'description': 'Test Transaction',
            'category': 'Test Category',
            'amount': Decimal('100.00'),
            'datetime': timezone.now(),
        }
    
    def test_duplicate_flags_are_created_for_both_transactions(self):
        """Test that duplicate flags are created for both transactions when they match"""
        # Create first transaction
        tx1 = Transaction.objects.create(**self.transaction_data)
        
        # Create second transaction with same data
        tx2 = Transaction.objects.create(**self.transaction_data)
        
        # Refresh from database to get updated flags
        tx1.refresh_from_db()
        tx2.refresh_from_db()
        
        # Verify both transactions have a duplicate flag
        tx1_dupe_flags = tx1.flags.filter(flag_type='DUPLICATE')
        tx2_dupe_flags = tx2.flags.filter(flag_type='DUPLICATE')
        
        self.assertEqual(tx1_dupe_flags.count(), 1, 
                         "First transaction should have a duplicate flag")
        self.assertEqual(tx2_dupe_flags.count(), 1, 
                         "Second transaction should have a duplicate flag")
        
        # Verify the duplicate flags point to each other
        self.assertEqual(tx1_dupe_flags.first().duplicates_transaction.id, tx2.id, 
                         "First transaction flag should point to second transaction")
        self.assertEqual(tx2_dupe_flags.first().duplicates_transaction.id, tx1.id,
                         "Second transaction flag should point to first transaction")
    
    def test_duplicate_flags_are_removed_when_transactions_no_longer_match(self):
        """Test that duplicate flags are removed when transactions no longer match"""
        # Create first transaction
        tx1 = Transaction.objects.create(**self.transaction_data)
        
        # Create second transaction with same data
        tx2 = Transaction.objects.create(**self.transaction_data)
        
        # Refresh from database to get updated flags
        tx1.refresh_from_db()
        tx2.refresh_from_db()
        
        # Verify both have duplicate flags initially
        self.assertEqual(tx1.flags.filter(flag_type='DUPLICATE').count(), 1)
        self.assertEqual(tx2.flags.filter(flag_type='DUPLICATE').count(), 1)
        
        # Update one transaction to make it different
        tx1.description = 'Updated Description'
        tx1.save()
        
        # Refresh from database to get updated flags
        tx1.refresh_from_db()
        tx2.refresh_from_db()
        
        # Verify both duplicate flags are now removed
        self.assertEqual(tx1.flags.filter(flag_type='DUPLICATE').count(), 0,
                         "First transaction should no longer have a duplicate flag")
        self.assertEqual(tx2.flags.filter(flag_type='DUPLICATE').count(), 0,
                         "Second transaction should no longer have a duplicate flag")