from rest_framework import serializers
from .models import Transaction, TransactionFlag, TransactionRule

class TransactionFlagSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransactionFlag
        fields = ['flag_type', 'message', 'duplicates_transaction']

class TransactionSerializer(serializers.ModelSerializer):
    flags = TransactionFlagSerializer(many=True, read_only=True)
    class Meta:
        model = Transaction
        fields = ['id', 'description', 'category', 'amount', 'datetime', 'created_at', 'updated_at', 'flags']

class TransactionCSVSerializer(serializers.Serializer):
    file = serializers.FileField()

    def validate_file(self, value):
        if not value.name.endswith('.csv'):
            raise serializers.ValidationError("File must be a CSV")
        return value
        
class TransactionRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransactionRule
        fields = [
            'id', 
            'filter_description', 
            'filter_amount_value', 
            'filter_amount_comparison',
            'category',
            'flag_message',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        
    def validate(self, data):
        """
        Validate that the rule has at least one filter criterion and one action.
        """
        # Check if at least one filter criterion is provided
        has_filter = bool(data.get('filter_description')) or (
            bool(data.get('filter_amount_value')) and bool(data.get('filter_amount_comparison'))
        )
        
        # Check if at least one action is provided
        has_action = bool(data.get('category')) or bool(data.get('flag_message'))
        
        if not has_filter:
            raise serializers.ValidationError("At least one filter criterion must be provided")
        
        if not has_action:
            raise serializers.ValidationError("At least one action (category or flag_message) must be provided")
            
        # If amount comparison is provided but not value, or vice versa
        if bool(data.get('filter_amount_comparison')) != bool(data.get('filter_amount_value')):
            raise serializers.ValidationError("Both amount comparison and value must be provided together")
            
        return data
