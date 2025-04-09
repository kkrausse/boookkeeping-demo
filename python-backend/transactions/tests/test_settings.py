"""
Settings for tests
"""
from django.test import override_settings, TestCase
from django.conf import settings

class APITestCase(TestCase):
    """Base class for API tests that sets up proper URL configuration"""
    
    def setUp(self):
        super().setUp()
        # Use DefaultRouter for easier URL resolution in tests
        from rest_framework.routers import DefaultRouter
        from transactions.views import TransactionViewSet, TransactionRuleViewSet
        
        self.router = DefaultRouter()
        self.router.register(r'transactions', TransactionViewSet)
        self.router.register(r'rules', TransactionRuleViewSet)
        
        # Create API client
        from rest_framework.test import APIClient
        self.client = APIClient()