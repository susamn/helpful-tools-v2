Feature: YAML Tool
  As a developer
  I want to format, validate, and manipulate YAML data
  So that I can work with YAML efficiently

  Background:
    Given I am on the YAML tool page
    And the page is fully loaded

  Scenario: Format valid YAML with pretty formatting
    Given I have valid YAML input:
      """
      name: John
      age: 30
      city: New York
      skills: [Python, JavaScript]
      active: true
      """
    When I paste the YAML into the input field
    And I click the "Format" button
    Then the YAML should be formatted with proper indentation
    And the output should be valid YAML
    And the output should contain proper line breaks and spacing

  Scenario: Validate invalid YAML and show error
    Given I have invalid YAML input:
      """
      name: John
      age: 30
      city: New York
      skills: [Python, JavaScript
      active: true
      """
    When I paste the YAML into the input field
    And I click the "Format" button
    Then I should see a YAML validation error message
    And the error should indicate the location of the syntax error
    And the output field should not be updated with invalid content

  Scenario: Minify YAML to compact format
    Given I have formatted YAML input:
      """
      name: John
      age: 30
      city: New York
      skills:
        - Python
        - JavaScript
      profile:
        bio: Developer
        active: true
      """
    When I paste the YAML into the input field
    And I click the "Minify" button
    Then the YAML should be compressed to a more compact format
    And the output should be valid YAML
    And unnecessary whitespace should be reduced

  Scenario: Convert YAML to JSON string
    Given I have YAML input:
      """
      user:
        name: John
        age: 30
        skills: [Python, JavaScript]
      """
    When I paste the YAML into the input field
    And I click the "Stringify" button
    Then the YAML should be converted to JSON string format
    And the output should be valid JSON
    And all YAML data should be preserved

  Scenario: Clear input and output fields
    Given I have YAML content in both input and output fields
    When I click the "Clear" button
    Then the input field should be empty
    And the output field should be empty
    And any error messages should be cleared

  Scenario: Copy formatted YAML to clipboard
    Given I have formatted YAML in the output field
    When I click the "Copy" button
    Then the formatted YAML should be copied to clipboard
    And I should see a success message confirming the copy action

  Scenario: Handle large YAML files
    Given I have a large YAML file with 100+ properties
    When I paste the YAML into the input field
    And I click the "Format" button
    Then the YAML should be processed without performance issues
    And the output should be properly formatted
    And the operation should complete within 5 seconds

  Scenario: Preserve YAML data types during formatting
    Given I have YAML with different data types:
      """
      string_value: "text"
      number_value: 123
      float_value: 45.67
      boolean_value: true
      null_value: null
      array_value: [1, 2, 3]
      object_value:
        nested: "value"
      """
    When I paste the YAML into the input field
    And I click the "Format" button
    Then all data types should be preserved in the output
    And strings should remain as strings
    And numbers should remain as numbers
    And booleans should remain as booleans
    And null values should remain as null

  Scenario: Format nested YAML objects
    Given I have deeply nested YAML:
      """
      level1:
        level2:
          level3:
            level4:
              data: "deep value"
              array:
                - item: 1
                - item: 2
      """
    When I paste the YAML into the input field
    And I click the "Format" button
    Then each nesting level should be properly indented
    And the structure should be clearly visible
    And all elements should be properly aligned

  Scenario: Handle empty YAML input
    Given I have empty input in the YAML field
    When I click the "Format" button
    Then I should see a message indicating empty input
    And the output field should remain empty
    And no error should be thrown

  Scenario: Validate YAML with special characters and unicode
    Given I have YAML with special characters:
      """
      name: José
      description: "This is a test with émojis 😀 and spéciàl çhars"
      unicode: "こんにちは"
      symbols: "!@#$%^&*()"
      """
    When I paste the YAML into the input field
    And I click the "Format" button
    Then the special characters should be preserved
    And the unicode characters should be properly displayed
    And the YAML should be valid after formatting

  Scenario: Use YAML path to query data
    Given I have formatted YAML with nested structure:
      """
      users:
        - name: John
          age: 30
        - name: Jane
          age: 25
      config:
        debug: true
        port: 8080
      """
    When I enter the path "users.0.name" in the search field
    Then the output should show only the queried data
    And the result should be "John"

  Scenario: Toggle syntax highlighting
    Given I have formatted YAML in the output field
    When I click the "Toggle Markup" button
    Then the syntax highlighting should be turned off
    And the output should show plain text
    When I click the "Toggle Markup" button again
    Then the syntax highlighting should be turned back on

  Scenario: Expand and collapse YAML sections
    Given I have formatted YAML with nested objects in the output field
    When I click the "Collapse All" button
    Then all nested sections should be collapsed
    When I click the "Expand All" button
    Then all nested sections should be expanded

  Scenario: Adjust indentation settings
    Given I have YAML input ready to format
    When I change the indent type to "tabs"
    And I change the indent size to "4"
    And I click the "Format" button
    Then the output should use tab indentation
    And the indentation should be 4 units wide

  Scenario: Handle YAML with comments
    Given I have YAML with comments:
      """
      # User configuration
      user:
        name: John  # User's name
        age: 30     # User's age
      # System settings
      config:
        debug: true  # Enable debug mode
      """
    When I paste the YAML into the input field
    And I click the "Format" button
    Then the comments should be preserved
    And the formatting should maintain comment alignment
    And the YAML should remain valid

  Scenario: Handle YAML anchors and aliases
    Given I have YAML with anchors and aliases:
      """
      defaults: &defaults
        timeout: 30
        retries: 3

      production:
        <<: *defaults
        host: prod.example.com

      staging:
        <<: *defaults
        host: staging.example.com
      """
    When I paste the YAML into the input field
    And I click the "Format" button
    Then the anchors and aliases should be preserved
    And the YAML structure should be maintained
    And the output should be valid YAML