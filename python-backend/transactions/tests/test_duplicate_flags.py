from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from transactions.models import Transaction, TransactionFlag
from transactions.utils import check_duplicates_bulk, create_transactions_with_flags_bulk

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
        
        # With our new implementation, we need to explicitly check for duplicates
        # since we're not using signals anymore
        check_duplicates_bulk([tx1, tx2])
        
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
        
        # With our new implementation, we need to explicitly check for duplicates
        check_duplicates_bulk([tx1, tx2])
        
        # Refresh from database to get updated flags
        tx1.refresh_from_db()
        tx2.refresh_from_db()
        
        # Verify both have duplicate flags initially
        self.assertEqual(tx1.flags.filter(flag_type='DUPLICATE').count(), 1)
        self.assertEqual(tx2.flags.filter(flag_type='DUPLICATE').count(), 1)
        
        # Update one transaction to make it different
        tx1.description = 'Updated Description'
        tx1.save()
        
        # With new implementation, need to call check_duplicates_bulk for updates too
        # This will clear flags since they no longer match
        from transactions.utils import update_transaction_with_flags
        update_transaction_with_flags(tx1, {'description': 'Updated Description'})
        
        # Refresh from database to get updated flags
        tx1.refresh_from_db()
        tx2.refresh_from_db()
        
        # Verify both duplicate flags are now removed
        self.assertEqual(tx1.flags.filter(flag_type='DUPLICATE').count(), 0,
                         "First transaction should no longer have a duplicate flag")
        self.assertEqual(tx2.flags.filter(flag_type='DUPLICATE').count(), 0,
                         "Second transaction should no longer have a duplicate flag")
    
    def test_bulk_duplicate_detection(self):
        """Test the optimized bulk duplicate detection with multiple transactions"""
        # Create a batch of transactions with duplicates
        batch_data = [
            {'description': 'Duplicate Item', 'amount': Decimal('50.00'), 'category': 'Test'},
            {'description': 'Duplicate Item', 'amount': Decimal('50.00'), 'category': 'Test'},
            {'description': 'Unique Item', 'amount': Decimal('75.00'), 'category': 'Test'},
            {'description': 'Another Duplicate', 'amount': Decimal('100.00'), 'category': 'Test'},
            {'description': 'Another Duplicate', 'amount': Decimal('100.00'), 'category': 'Test'},
            {'description': 'Another Duplicate', 'amount': Decimal('100.00'), 'category': 'Test'}
        ]
        
        # Create transactions
        transactions = []
        for data in batch_data:
            transactions.append(Transaction.objects.create(**data))
        
        # Run duplicate detection
        flags_map = check_duplicates_bulk(transactions)
        
        # Verify flags were created correctly
        # We should have 8 total duplicate flags:
        # - 2 flags for the pair of 'Duplicate Item' transactions (each points to the other)
        # - 6 flags for the three 'Another Duplicate' transactions (each points to the other two)
        total_flags = sum(len(flags) for flags in flags_map.values())
        self.assertEqual(total_flags, 8, "Should have created 8 duplicate flags in total")
        
        # Verify specific transactions have the right number of flags
        duplicate_item_transactions = Transaction.objects.filter(description='Duplicate Item')
        for tx in duplicate_item_transactions:
            self.assertEqual(tx.flags.filter(flag_type='DUPLICATE').count(), 1,
                            "'Duplicate Item' transactions should each have 1 duplicate flag")
        
        another_duplicate_transactions = Transaction.objects.filter(description='Another Duplicate')
        for tx in another_duplicate_transactions:
            self.assertEqual(tx.flags.filter(flag_type='DUPLICATE').count(), 2,
                            "'Another Duplicate' transactions should each have 2 duplicate flags")
    
    def test_null_amount_handling(self):
        """Test that transactions with null amounts are not considered duplicates"""
        # Create transactions with null amounts
        tx1 = Transaction.objects.create(
            description='Null Amount', 
            amount=None, 
            category='Test'
        )
        
        tx2 = Transaction.objects.create(
            description='Null Amount',
            amount=None,
            category='Test'
        )
        
        # Run duplicate detection
        flags_map = check_duplicates_bulk([tx1, tx2])
        
        # Verify no flags were created
        self.assertEqual(len(flags_map), 0, "Should not flag transactions with null amounts as duplicates")
        
        # Double-check database
        self.assertEqual(tx1.flags.filter(flag_type='DUPLICATE').count(), 0,
                         "First transaction should not have duplicate flags")
        self.assertEqual(tx2.flags.filter(flag_type='DUPLICATE').count(), 0,
                         "Second transaction should not have duplicate flags")
    
    def test_csv_upload_duplicate_detection(self):
        """Test that duplicate detection works correctly during CSV upload"""
        # Create test data with duplicates
        csv_data = [
            {'description': 'CSV Duplicate', 'amount': '150.00', 'category': 'Test', 'datetime': '2023-01-01'},
            {'description': 'CSV Duplicate', 'amount': '150.00', 'category': 'Test', 'datetime': '2023-01-01'},
            {'description': 'CSV Unique', 'amount': '200.00', 'category': 'Test', 'datetime': '2023-01-02'},
            {'description': 'CSV Triplicate', 'amount': '300.00', 'category': 'Test', 'datetime': '2023-01-03'},
            {'description': 'CSV Triplicate', 'amount': '300.00', 'category': 'Test', 'datetime': '2023-01-03'},
            {'description': 'CSV Triplicate', 'amount': '300.00', 'category': 'Test', 'datetime': '2023-01-03'}
        ]
        
        # Process using bulk creation
        transactions, flags_map = create_transactions_with_flags_bulk(csv_data)
        
        # Count duplicate flags
        duplicate_flags = 0
        for txn_id, flags in flags_map.items():
            for flag in flags:
                if flag['flag_type'] == 'DUPLICATE':
                    duplicate_flags += 1
        
        # We should have 8 duplicate flags total:
        # - 2 flags for the pair of 'CSV Duplicate' transactions 
        # - 6 flags for the three 'CSV Triplicate' transactions
        self.assertEqual(duplicate_flags, 8, "Should have created 8 duplicate flags from CSV data")
        
        # Verify duplicate pairs in database
        duplicate_txns = Transaction.objects.filter(description='CSV Duplicate')
        for txn in duplicate_txns:
            self.assertEqual(txn.flags.filter(flag_type='DUPLICATE').count(), 1,
                            "Each 'CSV Duplicate' transaction should have 1 flag")
        
        triplicate_txns = Transaction.objects.filter(description='CSV Triplicate')
        for txn in triplicate_txns:
            self.assertEqual(txn.flags.filter(flag_type='DUPLICATE').count(), 2,
                            "Each 'CSV Triplicate' transaction should have 2 flags")