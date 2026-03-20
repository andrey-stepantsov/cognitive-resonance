Feature: CLI Boot sequence
  As a developer
  I want to invoke the Cognitive Resonance CLI
  So that I can verify it boots correctly and renders the terminal UI

  Scenario: Displaying the help menu
    Given the CLI is executed with the "--help" flag
    Then the terminal output should contain "Cognitive Resonance"
    And the terminal output should contain "Commands:"
