# Generated by Django 5.2 on 2025-04-09 07:18

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('transactions', '0007_alter_transactionflag_unique_together_and_more'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='transactionflag',
            unique_together={('transaction', 'flag_type', 'message')},
        ),
    ]
