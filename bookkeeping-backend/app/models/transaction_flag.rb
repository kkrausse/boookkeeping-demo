class TransactionFlag < ApplicationRecord
  belongs_to :flagged_transaction, class_name: "Transaction"
end
