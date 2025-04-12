from django.db import models
from django.db.models.signals import post_save, pre_save, pre_delete
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
            models.Index(fields=['amount', 'description', 'datetime']),
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
    is_resolved = models.BooleanField(default=False,
                  help_text="Whether this flag has been manually resolved by the user")

    class Meta:
        # Make transaction + flag_type + message unique together to prevent exact duplicates
        # This allows multiple CUSTOM flags as long as they have different messages
        unique_together = [('transaction', 'flag_type', 'message')]
        indexes = [
            models.Index(fields=['duplicates_transaction']),
            models.Index(fields=['transaction', 'flag_type']),
            models.Index(fields=['is_resolved']),
        ]

# We've replaced the duplicate detection signals with a more efficient bulk implementation
# The duplicate detection now happens in check_duplicates_bulk() in utils.py

# Keep these commented as documentation of the previous implementation
# @receiver(pre_save, sender=Transaction)
# def check_duplicates(sender, instance, **kwargs):
#     # delete existing unresolved dupes
#     if instance.pk:
#         TransactionFlag.objects.filter(
#             transaction=instance,
#             flag_type='DUPLICATE',
#             is_resolved=False  # Only delete unresolved flags
#         ).delete()
# 
# @receiver(post_save, sender=Transaction)
# def create_duplicate_flag(sender, instance, created, **kwargs):
#     # This functionality is now handled by check_duplicates_bulk() in utils.py
        
class TransactionRule(models.Model):
    # Filter condition using JSONField for flexible filtering
    filter_condition = models.JSONField(
        blank=True, 
        null=True, 
        default=dict,
        help_text="JSON filter condition (e.g., {'amount__gt': 100, 'description__icontains': 'coffee'})"
    )
    
    # Actions to apply
    category = models.TextField(
        blank=True, 
        null=True,
        help_text="Category to set when rule matches"
    )
    flag_message = models.TextField(
        blank=True, 
        null=True,
        help_text="Flag message to add when rule matches"
    )
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        indexes = [
            models.Index(fields=['created_at']),
        ]
        
    def __str__(self):
        # Format filter conditions for human-readable display
        filter_parts = []
        if self.filter_condition:
            for key, value in self.filter_condition.items():
                if key.endswith('__icontains'):
                    field = key.replace('__icontains', '')
                    filter_parts.append(f"{field} contains '{value}'")
                elif key.endswith('__gt'):
                    field = key.replace('__gt', '')
                    filter_parts.append(f"{field} > {value}")
                elif key.endswith('__lt'):
                    field = key.replace('__lt', '')
                    filter_parts.append(f"{field} < {value}")
                elif key.endswith('__gte'):
                    field = key.replace('__gte', '')
                    filter_parts.append(f"{field} >= {value}")
                elif key.endswith('__lte'):
                    field = key.replace('__lte', '')
                    filter_parts.append(f"{field} <= {value}")
                elif key.endswith('__exact'):
                    field = key.replace('__exact', '')
                    filter_parts.append(f"{field} = {value}")
                else:
                    filter_parts.append(f"{key} = {value}")
            
        # Format actions
        actions = []
        if self.category:
            actions.append(f"set category to '{self.category}'")
        if self.flag_message:
            actions.append(f"add flag: '{self.flag_message}'")
            
        if filter_parts and actions:
            return f"Rule: If {' AND '.join(filter_parts)}, then {' and '.join(actions)}"
        return f"Rule #{self.pk}"

# Signals to invalidate the rule cache when rules are modified or deleted
@receiver(post_save, sender=TransactionRule)
def invalidate_rule_cache_on_save(sender, instance, **kwargs):
    # Import here to avoid circular imports
    from .utils import invalidate_rules_cache
    invalidate_rules_cache()

@receiver(pre_delete, sender=TransactionRule)
def invalidate_rule_cache_on_delete(sender, instance, **kwargs):
    # Import here to avoid circular imports
    from .utils import invalidate_rules_cache
    invalidate_rules_cache()
