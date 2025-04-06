class CreateTransactionFlags < ActiveRecord::Migration[8.0]
  def change
    create_table :transaction_flags do |t|
      t.string :flag_type
      t.text :message
      t.belongs_to :flagged_transaction, null: false,
                   foreign_key: { to_table: :transactions }
      t.references :duplicates_transaction,
                   foreign_key: { to_table: :transactions }

      t.timestamps
    end
  end
end
