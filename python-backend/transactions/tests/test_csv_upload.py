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