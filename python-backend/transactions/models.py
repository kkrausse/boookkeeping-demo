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
                'message': f'Possible duplicate of transaction {duplicate.id}'
            }
        )
