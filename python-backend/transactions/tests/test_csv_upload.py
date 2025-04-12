"""
Test for CSV upload functionality, especially bulk operations.
"""
from decimal import Decimal
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from transactions.models import Transaction, TransactionFlag, TransactionRule
import csv
import io

class CSVUploadTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # Create a test rule for coffee transactions
        self.rule = TransactionRule.objects.create(
            filter_condition={"description__icontains": "coffee"},
            category="Food & Dining",
            flag_message="Contains coffee"
        )
    
    def test_csv_bulk_upload(self):
        """Test the bulk CSV upload functionality."""
        # Record initial transaction count
        initial_count = Transaction.objects.count()
        
        # Create CSV data with multiple transactions
        csv_data = [
            {"description": "Grocery store", "category": "Food", "amount": "45.67", "datetime": "2023-01-01"},
            {"description": "Coffee shop", "category": "", "amount": "4.50", "datetime": "2023-01-02"},
            {"description": "Gas station", "category": "Transportation", "amount": "35.00", "datetime": "2023-01-03"},
            {"description": "Restaurant dinner", "category": "Food", "amount": "78.90", "datetime": "2023-01-04"},
            {"description": "Coffee beans", "category": "", "amount": "12.99", "datetime": "2023-01-05"},
        ]
        
        # Create a CSV file in memory
        csv_file = io.StringIO()
        writer = csv.DictWriter(csv_file, fieldnames=["description", "category", "amount", "datetime"])
        writer.writeheader()
        for row in csv_data:
            writer.writerow(row)
        
        # Convert to bytes for SimpleUploadedFile
        csv_content = csv_file.getvalue().encode()
        
        # Create an uploaded file
        uploaded_file = SimpleUploadedFile(
            name="test_transactions.csv",
            content=csv_content,
            content_type="text/csv"
        )
        
        # Upload the CSV file
        response = self.client.post(
            '/transactions/upload/',
            {'file': uploaded_file},
            format='multipart'
        )
        
        # Verify successful upload
        self.assertEqual(response.status_code, 201, f"Upload failed with error: {response.data}")
        
        # Verify the correct number of transactions were created
        new_count = Transaction.objects.count()
        self.assertEqual(new_count - initial_count, 5, "Expected 5 new transactions")
        
        # Verify rule was applied to coffee transactions
        coffee_beans = Transaction.objects.filter(description="Coffee beans").first()
        self.assertIsNotNone(coffee_beans, "Coffee beans transaction not found")
        self.assertEqual(coffee_beans.category, "Food & Dining", "Rule should have set category")
        
        coffee_shop = Transaction.objects.filter(description="Coffee shop").first()
        self.assertIsNotNone(coffee_shop, "Coffee shop transaction not found")
        self.assertEqual(coffee_shop.category, "Food & Dining", "Rule should have set category")
        
        # Verify flags were created for coffee transactions
        rule_flags = TransactionFlag.objects.filter(flag_type='RULE_MATCH').count()
        self.assertEqual(rule_flags, 2, "Expected 2 rule match flags for coffee transactions")
        
        # Verify transaction values were correctly parsed
        grocery = Transaction.objects.filter(description="Grocery store").first()
        self.assertEqual(grocery.amount, Decimal('45.67'), "Amount should be correctly parsed")
    
    def test_empty_csv_upload(self):
        """Test CSV upload with empty file."""
        # Create an empty CSV file
        csv_file = io.StringIO()
        writer = csv.DictWriter(csv_file, fieldnames=["description", "category", "amount", "datetime"])
        writer.writeheader()
        
        # Convert to bytes for SimpleUploadedFile
        csv_content = csv_file.getvalue().encode()
        
        # Create an uploaded file
        uploaded_file = SimpleUploadedFile(
            name="empty.csv",
            content=csv_content,
            content_type="text/csv"
        )
        
        # Upload the CSV file
        response = self.client.post(
            '/transactions/upload/',
            {'file': uploaded_file},
            format='multipart'
        )
        
        # Verify error response
        self.assertEqual(response.status_code, 400, "Should return 400 for empty CSV")
        self.assertIn("empty", str(response.data).lower(), "Error should mention empty file")
    
    def test_invalid_csv_upload(self):
        """Test CSV upload with invalid data."""
        # Create CSV with invalid data
        csv_file = io.StringIO()
        writer = csv.DictWriter(csv_file, fieldnames=["invalid_column"])
        writer.writeheader()
        writer.writerow({"invalid_column": "some value"})
        
        # Convert to bytes for SimpleUploadedFile
        csv_content = csv_file.getvalue().encode()
        
        # Create an uploaded file
        uploaded_file = SimpleUploadedFile(
            name="invalid.csv",
            content=csv_content,
            content_type="text/csv"
        )
        
        # Upload the CSV file
        response = self.client.post(
            '/transactions/upload/',
            {'file': uploaded_file},
            format='multipart'
        )
        
        # Verify error response
        self.assertEqual(response.status_code, 400, "Should return 400 for invalid CSV")
    
    def test_bulk_operations_with_duplicates(self):
        """Test bulk operations with focus on duplicate detection performance."""
        # Create a large batch of transactions with some duplicates
        import time
        from transactions.utils import create_transactions_with_flags_bulk
        
        # Create test data - 100 transactions with some duplicates
        # This is a smaller number for test speed, but demonstrates the concept
        base_data = []
        
        # Add 80 unique transactions
        for i in range(80):
            base_data.append({
                "description": f"Unique Transaction {i}",
                "amount": f"{i + 10}.99", 
                "category": "Test",
                "datetime": "2023-01-01"
            })
        
        # Add 10 pairs of duplicates (20 transactions)
        for i in range(10):
            duplicate = {
                "description": f"Duplicate Set {i}",
                "amount": "100.00",
                "category": "Test", 
                "datetime": "2023-01-01"
            }
            base_data.append(duplicate)
            base_data.append(duplicate.copy())  # Add duplicate
        
        # Measure performance
        start_time = time.time()
        transactions, flags_map = create_transactions_with_flags_bulk(base_data)
        end_time = time.time()
        
        # Verify correct number of transactions created
        self.assertEqual(len(transactions), 100, "Should have created 100 transactions")
        
        # Count duplicate flags
        duplicate_flags = 0
        for txn_id, flags in flags_map.items():
            for flag in flags:
                if flag['flag_type'] == 'DUPLICATE':
                    duplicate_flags += 1
        
        # Verify 20 duplicate flags created (each duplicate in a pair points to the other)
        self.assertEqual(duplicate_flags, 20, "Should have created 20 duplicate flags")
        
        # Verify database has the correct duplicate flags
        from transactions.models import TransactionFlag
        db_duplicate_flags = TransactionFlag.objects.filter(flag_type='DUPLICATE').count()
        self.assertEqual(db_duplicate_flags, 20, "Database should have 20 duplicate flags")
        
        # Log performance (doesn't affect test result but useful for debugging)
        print(f"Processed 100 transactions with duplicate detection in {end_time - start_time:.3f} seconds")
    
    def test_large_csv_upload_simulation(self):
        """Simulate a large CSV upload to test bulk processing performance."""
        from transactions.utils import create_transactions_with_flags_bulk
        import time
        
        # Create a moderate-sized dataset with 200 transactions
        # This is smaller than real-world scenarios but suitable for unit testing
        data = []
        
        # Add 160 unique transactions
        for i in range(160):
            data.append({
                "description": f"Item {i}",
                "amount": f"{(i % 100) + 10.99}", 
                "category": f"Category {i % 10}",
                "datetime": "2023-01-01"
            })
        
        # Add 20 pairs of duplicates (40 transactions)
        for i in range(20):
            dupe = {
                "description": f"Duplicate Item {i}",
                "amount": f"{50.00}", 
                "category": "Duplicates",
                "datetime": "2023-01-02"
            }
            data.append(dupe)
            data.append(dupe.copy())
        
        # Measure time to process the data in bulk
        start_time = time.time()
        transactions, _ = create_transactions_with_flags_bulk(data)
        end_time = time.time()
        
        # Verify the expected number of transactions
        self.assertEqual(len(transactions), 200, "Should have created 200 transactions")
        
        # Verify duplicate flags were created
        duplicate_flags = TransactionFlag.objects.filter(flag_type='DUPLICATE').count()
        self.assertEqual(duplicate_flags, 40, "Should have created 40 duplicate flags")
        
        # Verify transactions all have timestamps
        for txn in transactions:
            self.assertIsNotNone(txn.datetime, "All transactions should have timestamps")
            
        # Verify transactions have amounts
        amount_count = Transaction.objects.filter(amount__isnull=False).count()
        self.assertEqual(amount_count, 200, "All transactions should have amounts")
        
        # Log performance metrics (doesn't affect test result)
        print(f"Bulk processed 200 transactions in {end_time - start_time:.3f} seconds")