"""
URL configuration for tests
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from transactions.views import TransactionViewSet, TransactionRuleViewSet

# Create a router for testing purposes
router = DefaultRouter()
router.register(r'transactions', TransactionViewSet, basename='transaction')
router.register(r'rules', TransactionRuleViewSet, basename='rule')

urlpatterns = [
    path('', include(router.urls)),
]