# Generated manually

from django.db import migrations

def add_default_rules(apps, schema_editor):
    """
    Add default transaction rules that are applied automatically.
    """
    # Get the model from the versioned app registry
    TransactionRule = apps.get_model('transactions', 'TransactionRule')
    
    # Clear existing rules first (since we're recreating them)
    TransactionRule.objects.all().delete()
    
    # Grocery Auto-categorization
    TransactionRule.objects.create(
        filter_condition={"description__icontains": "grocery"},
        category="Groceries",
    )
    
    # Restaurant Auto-categorization
    TransactionRule.objects.create(
        filter_condition={"description__icontains": "restaurant"},
        category="Dining",
    )
    
    # Gas/Fuel Auto-categorization
    TransactionRule.objects.create(
        filter_condition={"description__icontains": "gas"},
        category="Transportation",
    )
    
    # High Amount Rule
    TransactionRule.objects.create(
        filter_condition={"amount__gt": 1000.00},
        flag_message="High value transaction (>$1,000)",
    )

    # Negative Amount Rule (Income)
    TransactionRule.objects.create(
        filter_condition={"amount__lt": 0.00},
        category="Income",
    )


class Migration(migrations.Migration):

    dependencies = [
        ('transactions', '0010_remove_transactionrule_filter_amount_comparison_and_more'),
    ]

    operations = [
        migrations.RunPython(add_default_rules),
    ]