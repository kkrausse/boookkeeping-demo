from rest_framework import serializers
from .models import Transaction, TransactionFlag, TransactionRule

class TransactionFlagSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransactionFlag
        fields = ['id', 'flag_type', 'message', 'duplicates_transaction', 'is_resolvable', 'is_resolved']

class TransactionSerializer(serializers.ModelSerializer):
    flags = TransactionFlagSerializer(many=True, read_only=True)
    flag_counts = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = Transaction
        fields = ['id', 'description', 'category', 'amount', 'datetime', 'created_at', 'updated_at', 'flags', 'flag_counts']
    
    def get_flag_counts(self, obj):
        """Return counts of unresolved flags by type using database aggregation"""
        from django.db.models import Count
        
        # Get counts by flag_type in a single database query using group by
        type_counts = obj.flags.filter(is_resolved=False) \
            .values('flag_type') \
            .annotate(count=Count('id')) \
            .order_by()
        
        # Convert to dictionary
        counts = {item['flag_type']: item['count'] for item in type_counts}
        
        # Add total
        counts['total'] = sum(counts.values())
        
        return counts

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
            'filter_condition',
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
        has_filter = bool(data.get('filter_condition'))
        
        # Check if at least one action is provided
        has_action = bool(data.get('category')) or bool(data.get('flag_message'))
        
        if not has_filter:
            raise serializers.ValidationError("At least one filter condition must be provided")
        
        if not has_action:
            raise serializers.ValidationError("At least one action (category or flag_message) must be provided")
            
        # Validate filter_condition is a valid dict
        filter_condition = data.get('filter_condition')
        if filter_condition and not isinstance(filter_condition, dict):
            raise serializers.ValidationError("filter_condition must be a JSON object")
            
        # Check if the filter condition has valid Django filter syntax
        if filter_condition:
            for key in filter_condition.keys():
                if not any(key.endswith(suffix) for suffix in ['', '__gt', '__lt', '__gte', '__lte', '__exact', '__icontains', '__contains']):
                    raise serializers.ValidationError(f"Invalid filter condition key: {key}")
            
        return data
