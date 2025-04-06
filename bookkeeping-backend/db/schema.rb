# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2025_04_06_190106) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "transaction_flags", force: :cascade do |t|
    t.string "flag_type"
    t.text "message"
    t.bigint "flagged_transaction_id", null: false
    t.bigint "duplicates_transaction_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["duplicates_transaction_id"], name: "index_transaction_flags_on_duplicates_transaction_id"
    t.index ["flagged_transaction_id"], name: "index_transaction_flags_on_flagged_transaction_id"
  end

  create_table "transactions", force: :cascade do |t|
    t.string "description"
    t.string "category"
    t.decimal "amount"
    t.datetime "datetime"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  add_foreign_key "transaction_flags", "transactions", column: "duplicates_transaction_id"
  add_foreign_key "transaction_flags", "transactions", column: "flagged_transaction_id"
end
