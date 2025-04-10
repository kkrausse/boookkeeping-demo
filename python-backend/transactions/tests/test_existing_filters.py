"""
Tests for existing filters and ordering in TransactionViewSet
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from transactions.models import Transaction
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta

class ExistingFiltersTests(TestCase):
    """Tests to ensure existing filters and sorting functionality still works"""

    def setUp(self):
        """Set up test data with transactions having different dates and values"""
        # Create client
        self.client = APIClient()
        
        # Create base date for consistent timestamps
        self.base_date = timezone.now()
        
        # Create transactions with different dates and values
        # Transaction 1 - oldest
        self.tx1 = Transaction.objects.create(
            description="Oldest transaction",
            category="Test",
            amount=Decimal("100.00"),
            datetime=self.base_date - timedelta(days=10)
        )
        
        # Transaction 2 - middle date
        self.tx2 = Transaction.objects.create(
            description="Middle transaction",
            category="Test",
            amount=Decimal("200.00"),
            datetime=self.base_date - timedelta(days=5)
        )
        
        # Transaction 3 - newest
        self.tx3 = Transaction.objects.create(
            description="Newest transaction",
            category="Test",
            amount=Decimal("300.00"),
            datetime=self.base_date
        )
        
        # URL for transactions list
        self.url = reverse('transaction-list')

    def test_date_sorting_descending(self):
        """Test that transactions can be sorted by date in descending order"""
        response = self.client.get(f"{self.url}?ordering=-datetime")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check ordering - should be newest first (tx3, tx2, tx1)
        results = response.data['results']
        self.assertEqual(len(results), 3)
        
        # First transaction should be the newest
        self.assertEqual(results[0]['id'], self.tx3.id)
        
        # Last transaction should be the oldest
        self.assertEqual(results[2]['id'], self.tx1.id)
        
        # Check the middle transaction
        self.assertEqual(results[1]['id'], self.tx2.id)

    def test_date_sorting_ascending(self):
        """Test that transactions can be sorted by date in ascending order"""
        response = self.client.get(f"{self.url}?ordering=datetime")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check ordering - should be oldest first (tx1, tx2, tx3)
        results = response.data['results']
        self.assertEqual(len(results), 3)
        
        # First transaction should be the oldest
        self.assertEqual(results[0]['id'], self.tx1.id)
        
        # Last transaction should be the newest
        self.assertEqual(results[2]['id'], self.tx3.id)
        
        # Check the middle transaction
        self.assertEqual(results[1]['id'], self.tx2.id)

    def test_amount_sorting_descending(self):
        """Test that transactions can be sorted by amount in descending order"""
        response = self.client.get(f"{self.url}?ordering=-amount")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check ordering - should be highest amount first (tx3, tx2, tx1)
        results = response.data['results']
        self.assertEqual(len(results), 3)
        
        # First transaction should have the highest amount
        self.assertEqual(results[0]['id'], self.tx3.id)
        
        # Last transaction should have the lowest amount
        self.assertEqual(results[2]['id'], self.tx1.id)
        
        # Check the middle transaction
        self.assertEqual(results[1]['id'], self.tx2.id)

    def test_pagination(self):
        """Test that pagination works correctly"""
        # Create more transactions to test pagination
        for i in range(15):
            Transaction.objects.create(
                description=f"Pagination test transaction {i}",
                category="Pagination",
                amount=Decimal(i),
                datetime=self.base_date - timedelta(days=i)
            )
        
        # First page with page_size=10
        response = self.client.get(f"{self.url}?page=1&page_size=10")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 10)
        self.assertIsNotNone(response.data['next'])
        self.assertIsNone(response.data['previous'])
        
        # Second page with page_size=10
        response = self.client.get(f"{self.url}?page=2&page_size=10")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 8)  # 3 original + 15 new = 18 total
        self.assertIsNone(response.data['next'])
        self.assertIsNotNone(response.data['previous'])

    def test_filter_description(self):
        """Test filtering by description"""
        response = self.client.get(f"{self.url}?description__icontains=Middle")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Should only return the transaction with "Middle" in description
        results = response.data['results']
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], self.tx2.id)

    def test_filter_amount_gt(self):
        """Test filtering by amount greater than"""
        response = self.client.get(f"{self.url}?amount__gt=150")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Should return transactions with amount > 150
        results = response.data['results']
        self.assertEqual(len(results), 2)
        
        # Should include tx2 and tx3 but not tx1
        ids = [result['id'] for result in results]
        self.assertIn(self.tx2.id, ids)
        self.assertIn(self.tx3.id, ids)
        self.assertNotIn(self.tx1.id, ids)

    def test_combined_filters_and_sorting(self):
        """Test combining filters with sorting"""
        # Create some additional transactions for this test
        tx4 = Transaction.objects.create(
            description="Combined test high amount",
            category="Combined",
            amount=Decimal("400.00"),
            datetime=self.base_date - timedelta(days=2)
        )
        
        tx5 = Transaction.objects.create(
            description="Combined test low amount",
            category="Combined",
            amount=Decimal("50.00"),
            datetime=self.base_date - timedelta(days=1)
        )
        
        # Test: Filter by category "Combined" and sort by amount descending
        response = self.client.get(f"{self.url}?category=Combined&ordering=-amount")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Should return only Combined category transactions, sorted by amount
        results = response.data['results']
        self.assertEqual(len(results), 2)
        
        # First should be highest amount (tx4)
        self.assertEqual(results[0]['id'], tx4.id)
        
        # Second should be lowest amount (tx5)
        self.assertEqual(results[1]['id'], tx5.id)