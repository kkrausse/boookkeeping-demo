# Generated by Django 5.2 on 2025-04-11 23:29

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('transactions', '0008_alter_transactionflag_unique_together'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['amount', 'description'], name='transaction_amount_94b800_idx'),
        ),
    ]
