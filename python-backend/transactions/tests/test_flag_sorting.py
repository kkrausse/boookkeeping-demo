"""
Tests for flag count sorting in TransactionViewSet
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from transactions.models import Transaction, TransactionFlag
from decimal import Decimal
from django.utils import timezone

class FlagSortingTests(TestCase):
    """Tests for flag count sorting functionality"""

    def setUp(self):
        """Set up test data with transactions having different flag counts"""
        # Create client
        self.client = APIClient()
        
        # Create base date for consistent timestamps
        self.base_date = timezone.now()
        
        # Create transactions with different numbers of flags
        # Transaction with 0 flags
        self.tx_no_flags = Transaction.objects.create(
            description="No flags transaction",
            category="Test",
            amount=Decimal("100.00"),
            datetime=self.base_date
        )
        
        # Transaction with 1 flag
        self.tx_one_flag = Transaction.objects.create(
            description="One flag transaction",
            category="Test",
            amount=Decimal("200.00"),
            datetime=self.base_date
        )
        TransactionFlag.objects.create(
            transaction=self.tx_one_flag,
            flag_type="TEST",
            message="Test flag 1",
            is_resolvable=True
        )
        
        # Transaction with 2 flags
        self.tx_two_flags = Transaction.objects.create(
            description="Two flags transaction",
            category="Test",
            amount=Decimal("300.00"),
            datetime=self.base_date
        )
        TransactionFlag.objects.create(
            transaction=self.tx_two_flags,
            flag_type="TEST",
            message="Test flag 1",
            is_resolvable=True
        )
        TransactionFlag.objects.create(
            transaction=self.tx_two_flags,
            flag_type="TEST2",
            message="Test flag 2",
            is_resolvable=True
        )
        
        # Transaction with 3 flags
        self.tx_three_flags = Transaction.objects.create(
            description="Three flags transaction",
            category="Test",
            amount=Decimal("400.00"),
            datetime=self.base_date
        )
        TransactionFlag.objects.create(
            transaction=self.tx_three_flags,
            flag_type="TEST",
            message="Test flag 1",
            is_resolvable=True
        )
        TransactionFlag.objects.create(
            transaction=self.tx_three_flags,
            flag_type="TEST2",
            message="Test flag 2",
            is_resolvable=True
        )
        TransactionFlag.objects.create(
            transaction=self.tx_three_flags,
            flag_type="TEST3",
            message="Test flag 3",
            is_resolvable=True
        )
        
        # URL for transactions list
        self.url = reverse('transaction-list')

    def test_flag_count_sorting_ascending(self):
        """Test that transactions can be sorted by flag count in ascending order"""
        response = self.client.get(f"{self.url}?ordering=flag_count")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check ordering - should be no flags, one flag, two flags, three flags
        results = response.data['results']
        self.assertEqual(len(results), 4)
        
        # First transaction should have no flags
        self.assertEqual(results[0]['id'], self.tx_no_flags.id)
        self.assertEqual(len(results[0]['flags']), 0)
        
        # Last transaction should have three flags
        self.assertEqual(results[3]['id'], self.tx_three_flags.id)
        self.assertEqual(len(results[3]['flags']), 3)
        
        # Check that ordering is correct throughout
        self.assertEqual(results[1]['id'], self.tx_one_flag.id)
        self.assertEqual(len(results[1]['flags']), 1)
        
        self.assertEqual(results[2]['id'], self.tx_two_flags.id)
        self.assertEqual(len(results[2]['flags']), 2)

    def test_flag_count_sorting_descending(self):
        """Test that transactions can be sorted by flag count in descending order"""
        response = self.client.get(f"{self.url}?ordering=-flag_count")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check ordering - should be three flags, two flags, one flag, no flags
        results = response.data['results']
        self.assertEqual(len(results), 4)
        
        # First transaction should have three flags
        self.assertEqual(results[0]['id'], self.tx_three_flags.id)
        self.assertEqual(len(results[0]['flags']), 3)
        
        # Last transaction should have no flags
        self.assertEqual(results[3]['id'], self.tx_no_flags.id)
        self.assertEqual(len(results[3]['flags']), 0)
        
        # Check that ordering is correct throughout
        self.assertEqual(results[1]['id'], self.tx_two_flags.id)
        self.assertEqual(len(results[1]['flags']), 2)
        
        self.assertEqual(results[2]['id'], self.tx_one_flag.id)
        self.assertEqual(len(results[2]['flags']), 1)