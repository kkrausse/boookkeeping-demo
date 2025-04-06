require "csv"

class Api::TransactionsController < ApplicationController
  before_action :set_transaction, only: [ :show, :update, :destroy ]

  def index
    @transactions = Transaction.all
    render json: @transactions
  end

  def show
    render json: @transaction
  end

  def create
    transaction, flags = parse_transaction(transaction_params)
    @transaction = Transaction.new(transaction_params)

    puts "creating transaction"
    puts transaction_params
    puts @transaction
    if @transaction.save
      flags.each do |flag|
        @transaction
      end
      render json: @transaction, status: :created
    else
      render json: @transaction.errors, status: :unprocessable_entity
    end
  end

  def update
    if @transaction.update(transaction_params)
      render json: @transaction
    else
      render json: @transaction.errors, status: :unprocessable_entity
    end
  end

  def destroy
    @transaction.destroy
    head :no_content
  end

  # New upload action
  def upload
    uploaded_file = params[:file]
    if uploaded_file.nil?
      render json: { error: "No file uploaded" }, status: :unprocessable_entity
      return
    end

    begin
      csv = CSV.read(uploaded_file.path, headers: true)
      # Validate headers
      if csv.headers != [ "description", "category", "amount", "datetime" ]
        render json: { error: "Invalid headers" }, status: :unprocessable_entity
        return
      end

      transactions = []
      flags = []

      csv.each do |row|
        description = row["description"]
        category = row["category"]
        amount = row["amount"].to_f
        datetime = DateTime.parse(row["datetime"]) rescue nil

        transaction = Transaction.create(description: description, category: category, amount: amount, datetime: datetime)
        transactions << transaction
      end

      # Process flags and return success
      render json: { message: "success" }, status: :ok
    rescue => e
      render json: { error: "Failed to process file: #{e.message}" }, status: :unprocessable_entity
    end
  end

  private

  def parse_transaction(params)
    flags = []
    transaction = nil

    # Parse and validate fields
    description = params[:description]
    category = params[:category]
    amount = parse_amount(params[:amount])
    datetime = parse_datetime(params[:datetime])

    if description.blank?
      flags << TransactionFlag.new(flag_type: "missing_data", message: "empty description")
    end

    if category.blank?
      flags << TransactionFlag.new(flag_type: "missing_data", message: "empty category")
    end

    [ transaction, flags ]
  end

  def parse_amount(raw)
    return nil if raw.nil?
    raw.to_s.gsub(/[^\d.-]/, "").to_f
  end

  def parse_datetime(raw)
    DateTime.parse(raw) rescue nil
  end

  def set_transaction
    @transaction = Transaction.find(params[:id])
  end

  def transaction_params
    params.require(:transaction).permit(:description, :category, :amount, :datetime)
  end
end
