require "test_helper"

class Api::TransactionsControllerTest < ActionDispatch::IntegrationTest
  # test "the truth" do
  #   assert true
  # end

  test "should create transaction" do
    assert_difference("Transaction.count", 1) do
      post api_transactions_url, params: {
        transaction: {
          description: "Test Transaction",
          category: "Test Category",
          amount: 9.99,
          datetime: "2025-04-06T12:00:00Z"
        }
      }, as: :json
    end

    assert_response :created

    response_json = JSON.parse(@response.body)
    assert_equal "Test Transaction", response_json["description"]
  end

  test "should create bad amount" do
    assert_difference("Transaction.count", 1) do
      post api_transactions_url, params: {
        transaction: {
          description: "Test Transaction",
          category: "Test Category",
          amount: "$9.99",
          datetime: "2025-04-06T12:00:00Z"
        }
      }, as: :json
    end

    assert_response :created

    response_json = JSON.parse(@response.body)
    puts "response"
    puts @response.body
    assert_equal "Test Transaction", response_json["description"]
  end
end
