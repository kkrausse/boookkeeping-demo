from django.db import models
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

class Transaction(models.Model):
    description = models.TextField(blank=True)
    category = models.TextField(blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    datetime = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['category']),
            models.Index(fields=['created_at']),
        ]

class TransactionFlag(models.Model):
    transaction = models.ForeignKey(
        Transaction,
        on_delete=models.CASCADE,
        related_name='flags'
    )
    duplicates_transaction = models.ForeignKey(
        Transaction,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='duplicated_by'
    )
    flag_type = models.TextField()
    message = models.TextField()
    is_resolvable = models.BooleanField(default=False, 
                    help_text="Whether this flag can be manually resolved by the user")

    class Meta:
        unique_together = ('transaction', 'flag_type')
        indexes = [
            models.Index(fields=['duplicates_transaction']),
        ]

@receiver(pre_save, sender=Transaction)
def check_duplicates(sender, instance, **kwargs):
    # delete existing dupes
    if instance.pk:
        TransactionFlag.objects.filter(
            transaction=instance,
            flag_type='DUPLICATE'
        ).delete()

@receiver(post_save, sender=Transaction)
def create_duplicate_flag(sender, instance, created, **kwargs):
    # Create a filter dictionary with non-null values
    filter_dict = {'description': instance.description, 'category': instance.category}
    
    # Only add amount to the filter if it's not None
    if instance.amount is not None:
        filter_dict['amount'] = instance.amount
    
    # Check for duplicates
    if Transaction.objects.filter(**filter_dict).exclude(pk=instance.pk).exists():
        duplicate = Transaction.objects.filter(**filter_dict).exclude(pk=instance.pk).first()

        TransactionFlag.objects.update_or_create(
            transaction=instance,
            flag_type='DUPLICATE',
            defaults={
                'duplicates_transaction': duplicate,
                'message': f'Possible duplicate of transaction {duplicate.id}',
                'is_resolvable': True
            }
        )
        
class TransactionRule(models.Model):
    COMPARISON_CHOICES = [
        ('above', 'Above'),
        ('below', 'Below'),
        ('equal', 'Equal'),
    ]
    
    # Filter criteria
    filter_description = models.TextField(blank=True, null=True, 
                            help_text="Description substring to match (case insensitive)")
    filter_amount_value = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True,
                            help_text="Amount value to compare")
    filter_amount_comparison = models.CharField(max_length=10, choices=COMPARISON_CHOICES, blank=True, null=True,
                            help_text="Amount comparison operator")
    
    # Actions to apply
    category = models.TextField(blank=True, null=True,
                  help_text="Category to set when rule matches")
    flag_message = models.TextField(blank=True, null=True,
                     help_text="Flag message to add when rule matches")
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        indexes = [
            models.Index(fields=['created_at']),
        ]
        
    def __str__(self):
        parts = []
        if self.filter_description:
            parts.append(f"Description contains '{self.filter_description}'")
        if self.filter_amount_value and self.filter_amount_comparison:
            parts.append(f"Amount {self.filter_amount_comparison} {self.filter_amount_value}")
            
        actions = []
        if self.category:
            actions.append(f"set category to '{self.category}'")
        if self.flag_message:
            actions.append(f"add flag: '{self.flag_message}'")
            
        if parts and actions:
            return f"Rule: If {' and '.join(parts)}, then {' and '.join(actions)}"
        return f"Rule #{self.pk}"
