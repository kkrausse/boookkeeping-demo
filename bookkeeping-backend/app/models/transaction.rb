class Transaction < ApplicationRecord
  has_many :transaction_flags,
           dependent: :destroy,
           foreign_key: "flagged_transaction"
  has_many :duplicate_flag,
           dependent: :destroy,
           class_name: "TransactionFlag",
           foreign_key: "duplicates_transaction"

  # Add flags in memory
  def add_flag(flag_type, message)
    self.transaction_flags.build(
      flag_type: flag_type,
      message: message
    )
  end

  # Automatically save flags after creating or updating a transaction
  after_create :save_flags
  after_update :save_flags

  private

  def save_flags
    self.transaction_flags.each(&:save)
  end
end
