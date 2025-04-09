"""
Tests for custom transaction flag functionality.

These tests specifically validate:
1. Creating custom flags via API
2. Resolving flags via API
3. How the custom flag integrates with transaction updates
"""
import json
from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework import status
from transactions.views import TransactionViewSet
from django.utils import timezone
from transactions.models import Transaction, TransactionFlag, TransactionRule


class CustomFlagTests(TestCase):
    def setUp(self):
        # Create API client and factory
        self.client = APIClient()
        self.factory = APIRequestFactory()
        
        # Create test transaction
        self.transaction = Transaction.objects.create(
            description="Test Transaction",
            amount=Decimal('100.00'),
            category="Test"
        )
        
        # Create a custom flag
        self.custom_flag = TransactionFlag.objects.create(
            transaction=self.transaction,
            flag_type='CUSTOM',
            message='Existing custom flag',
            is_resolvable=True
        )

    def test_create_custom_flag_with_transaction_update(self):
        """Test creating a custom flag by including custom_flag in transaction update."""
        url = reverse('transaction-detail', kwargs={'pk': self.transaction.id})
        
        # Update transaction with a custom flag
        data = {
            'description': 'Updated transaction',
            'amount': '100.00',
            'category': 'Test',
            'custom_flag': {
                'flag_type': 'CUSTOM',
                'message': 'API added custom flag',
                'is_resolvable': True
            }
        }
        
        response = self.client.put(url, data, format='json')
        self.assertEqual(response.status_code, 200)
        
        # Check if the new flag was created
        self.assertEqual(
            TransactionFlag.objects.filter(
                transaction=self.transaction,
                flag_type='CUSTOM',
                message='API added custom flag'
            ).count(),
            1
        )
        
        # And that the original flag still exists
        self.assertEqual(
            TransactionFlag.objects.filter(
                transaction=self.transaction,
                flag_type='CUSTOM',
                message='Existing custom flag'
            ).count(),
            1
        )
        
        # There should be 2 custom flags total now
        self.assertEqual(
            TransactionFlag.objects.filter(
                transaction=self.transaction,
                flag_type='CUSTOM'
            ).count(),
            2
        )

    def test_resolve_flag_via_api(self):
        """Test resolving (deleting) a flag via the API endpoint."""
        url = reverse('transaction-resolve-flag', kwargs={
            'pk': self.transaction.id,
            'flag_id': self.custom_flag.id
        })
        
        # Call the resolve flag endpoint
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, 200)
        
        # The flag should be deleted
        self.assertEqual(
            TransactionFlag.objects.filter(id=self.custom_flag.id).count(),
            0
        )
        
        # Check response indicates success
        self.assertEqual(response.data['status'], 'success')

    def test_cannot_resolve_nonresolvable_flag(self):
        """Test that non-resolvable flags cannot be resolved via API."""
        # Create a non-resolvable parse error flag
        parse_error_flag = TransactionFlag.objects.create(
            transaction=self.transaction,
            flag_type='PARSE_ERROR',
            message='Non-resolvable parse error',
            is_resolvable=False
        )
        
        url = reverse('transaction-resolve-flag', kwargs={
            'pk': self.transaction.id,
            'flag_id': parse_error_flag.id
        })
        
        # Call the resolve flag endpoint
        response = self.client.post(url, {}, format='json')
        
        # Should get error response
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['status'], 'error')
        self.assertEqual(
            response.data['message'], 
            'This flag cannot be manually resolved'
        )
        
        # The flag should still exist
        self.assertEqual(
            TransactionFlag.objects.filter(id=parse_error_flag.id).count(),
            1
        )

    def test_flag_only_update(self):
        """Test that an update with only a custom_flag still works."""
        
        # In a real PUT/PATCH, we need some data - in our case, we'll include
        # the existing data values but also add our custom flag
        data = {
            'description': 'Test Transaction',
            'amount': '100.00',
            'category': 'Test',
            'custom_flag': {
                'flag_type': 'CUSTOM',
                'message': 'Flag-only update test',
                'is_resolvable': True
            }
        }
        
        # Use the viewset directly rather than URL routing
        view = TransactionViewSet.as_view({'patch': 'partial_update'})
        request = self.factory.patch('/', data, format='json')
        response = view(request, pk=self.transaction.id)
        
        self.assertEqual(response.status_code, 200)
        
        # Check if the new flag was created
        self.assertEqual(
            TransactionFlag.objects.filter(
                transaction=self.transaction,
                flag_type='CUSTOM',
                message='Flag-only update test'
            ).count(),
            1
        )
        
        # Transaction data should remain unchanged
        updated_transaction = Transaction.objects.get(id=self.transaction.id)
        self.assertEqual(updated_transaction.description, "Test Transaction")
        self.assertEqual(updated_transaction.amount, Decimal('100.00'))
        self.assertEqual(updated_transaction.category, "Test")

    def test_multiple_flag_types(self):
        """Test that different flag types can coexist and be handled properly."""
        # Create different types of flags
        missing_data_flag = TransactionFlag.objects.create(
            transaction=self.transaction,
            flag_type='MISSING_DATA',
            message='Test missing data',
            is_resolvable=True
        )
        
        rule_flag = TransactionFlag.objects.create(
            transaction=self.transaction,
            flag_type='RULE_MATCH',
            message='Test rule match',
            is_resolvable=True
        )
        
        # Update transaction with a new category
        url = reverse('transaction-detail', kwargs={'pk': self.transaction.id})
        data = {
            'description': 'Test Transaction',
            'amount': '100.00',
            'category': 'New Category',
            'custom_flag': {
                'flag_type': 'CUSTOM',
                'message': 'Another custom flag',
                'is_resolvable': True
            }
        }
        
        response = self.client.put(url, data, format='json')
        self.assertEqual(response.status_code, 200)
        
        # MISSING_DATA flag should be gone since we have a category
        self.assertEqual(
            TransactionFlag.objects.filter(id=missing_data_flag.id).exists(),
            False
        )
        
        # RULE_MATCH flag should also be gone (gets recomputed)
        self.assertEqual(
            TransactionFlag.objects.filter(id=rule_flag.id).exists(),
            False
        )
        
        # Original CUSTOM flag should remain
        self.assertEqual(
            TransactionFlag.objects.filter(id=self.custom_flag.id).exists(),
            True
        )
        
        # New CUSTOM flag should be created
        self.assertEqual(
            TransactionFlag.objects.filter(
                transaction=self.transaction,
                flag_type='CUSTOM',
                message='Another custom flag'
            ).count(),
            1
        )