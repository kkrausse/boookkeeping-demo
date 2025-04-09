"""
Integration tests for transaction flag API.
"""
from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework import status
from transactions.models import Transaction, TransactionFlag, TransactionRule
from transactions.views import TransactionViewSet

class TransactionFlagAPITests(TestCase):
    def setUp(self):
        """Set up test data."""
        self.client = APIClient()
        self.factory = APIRequestFactory()
        
        # Create test transactions
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
        
    def test_add_custom_flag_to_transaction(self):
        """Test adding a custom flag to a transaction."""
        update_data = {
            # Include all required fields for transaction but keep them the same
            'description': 'Test Transaction',
            'amount': '100.00',
            'category': 'Test',
            'custom_flag': {
                'flag_type': 'CUSTOM',
                'message': 'Test custom flag',
                'is_resolvable': True
            }
        }
        
        # Use the viewset directly rather than URL routing
        view = TransactionViewSet.as_view({'patch': 'partial_update'})
        request = self.factory.patch('/', update_data, format='json')
        response = view(request, pk=self.transaction.id)
        
        print(f"Response status: {response.status_code}")
        if hasattr(response, 'data') and 'error' in response.data:
            print(f"Error: {response.data['error']}")
            
        self.assertEqual(response.status_code, 200)
        
        # Verify flag was created
        flag_exists = TransactionFlag.objects.filter(
            transaction=self.transaction,
            flag_type='CUSTOM',
            message='Test custom flag'
        ).exists()
        
        self.assertTrue(flag_exists)
        
    def test_resolve_flag(self):
        """Test resolving a flag."""
        # Use the viewset directly rather than URL routing
        view = TransactionViewSet.as_view({'post': 'resolve_flag'})
        request = self.factory.post('/', {}, format='json')
        response = view(request, pk=self.transaction.id, flag_id=self.custom_flag.id)
        
        self.assertEqual(response.status_code, 200)
        
        # Verify flag was deleted
        flag_exists = TransactionFlag.objects.filter(id=self.custom_flag.id).exists()
        self.assertFalse(flag_exists)