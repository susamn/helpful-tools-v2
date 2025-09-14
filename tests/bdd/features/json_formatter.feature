Feature: JSON Formatter Tool
  As a developer
  I want to format, validate, and manipulate JSON data
  So that I can work with JSON efficiently

  Background:
    Given I am on the JSON formatter page
    And the page is fully loaded

  Scenario: Format valid JSON with pretty formatting
    Given I have valid JSON input:
      """
      {"name":"John","age":30,"city":"New York","skills":["Python","JavaScript"],"active":true}
      """
    When I paste the JSON into the input field
    And I click the "Format" button
    Then the JSON should be formatted with proper indentation
    And the output should be valid JSON
    And the output should contain proper line breaks and spacing

  Scenario: Validate invalid JSON and show error
    Given I have invalid JSON input:
      """
      {"name":"John","age":30,"city":"New York","skills":["Python","JavaScript],"active":true}
      """
    When I paste the JSON into the input field
    And I click the "Format" button
    Then I should see a JSON validation error message
    And the error should indicate the location of the syntax error
    And the output field should not be updated with invalid content

  Scenario: Minify JSON to compact format
    Given I have formatted JSON input:
      """
      {
        "name": "John",
        "age": 30,
        "city": "New York",
        "skills": [
          "Python",
          "JavaScript"
        ],
        "active": true
      }
      """
    When I paste the JSON into the input field
    And I click the "Minify" button
    Then the JSON should be compressed to a single line
    And the output should be valid JSON
    And all unnecessary whitespace should be removed

  Scenario: Clear input and output fields
    Given I have JSON content in both input and output fields
    When I click the "Clear" button
    Then the input field should be empty
    And the output field should be empty
    And any error messages should be cleared

  Scenario: Copy formatted JSON to clipboard
    Given I have formatted JSON in the output field
    When I click the "Copy" button
    Then the formatted JSON should be copied to clipboard
    And I should see a success message confirming the copy action

  Scenario: Handle large JSON files
    Given I have a large JSON file with 1000+ properties
    When I paste the JSON into the input field
    And I click the "Format" button
    Then the JSON should be processed without performance issues
    And the output should be properly formatted
    And the operation should complete within 5 seconds

  Scenario: Preserve JSON data types during formatting
    Given I have JSON with different data types:
      """
      {"string":"text","number":123,"float":45.67,"boolean":true,"null":null,"array":[1,2,3],"object":{"nested":"value"}}
      """
    When I paste the JSON into the input field
    And I click the "Format" button
    Then all data types should be preserved in the output
    And strings should remain as strings
    And numbers should remain as numbers
    And booleans should remain as booleans
    And null values should remain as null

  Scenario: Format nested JSON objects
    Given I have deeply nested JSON:
      """
      {"level1":{"level2":{"level3":{"level4":{"data":"deep value","array":[{"item":1},{"item":2}]}}}}}
      """
    When I paste the JSON into the input field
    And I click the "Format" button
    Then each nesting level should be properly indented
    And the structure should be clearly visible
    And all brackets and braces should be properly aligned

  Scenario: Handle empty JSON input
    Given I have empty input in the JSON field
    When I click the "Format" button
    Then I should see a message indicating empty input
    And the output field should remain empty
    And no error should be thrown

  Scenario: Validate JSON with special characters and unicode
    Given I have JSON with special characters:
      """
      {"name":"José","description":"This is a test with émojis 😀 and spéciàl çhars","unicode":"こんにちは"}
      """
    When I paste the JSON into the input field
    And I click the "Format" button
    Then the special characters should be preserved
    And the unicode characters should be properly displayed
    And the JSON should be valid after formatting