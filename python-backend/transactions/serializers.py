from rest_framework import serializers
from .models import Transaction, TransactionFlag

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
