# Generated by Django 5.2 on 2025-04-08 00:15

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('transactions', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='transaction',
            name='datetime',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
