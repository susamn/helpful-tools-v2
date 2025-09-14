# Dependencies Management

## Core Dependencies

### Application Core
- **Flask==3.0.0** - Web framework for the application
- **PyYAML==6.0.1** - YAML parsing and generation
- **xmltodict==0.13.0** - XML to dictionary conversion

### Testing Framework
- **pytest==7.4.3** - Unit and integration testing framework
- **requests-mock==1.11.0** - Mock HTTP requests for testing
- **pytest-mock==3.11.1** - Enhanced mocking capabilities
- **requests==2.31.0** - HTTP library for API testing

### BDD Testing (Essential Only)
- **behave==1.2.6** - Behavior-Driven Development framework
- **selenium==4.15.0** - Web browser automation
- **webdriver-manager==4.0.1** - Automatic WebDriver management

### Development Support
- **colorama==0.4.6** - Cross-platform colored terminal text

## Removed Dependencies

The following libraries were **removed** to keep dependencies minimal and manageable:

### Removed from BDD Testing
- ❌ **pyperclip** - Clipboard access library
  - *Reason*: External system dependency, not essential for UI testing
  - *Alternative*: Test copy button interaction via DOM events instead of actual clipboard

- ❌ **Pillow** - Image processing library
  - *Reason*: Not needed for current test scenarios
  - *Alternative*: Use Selenium's built-in screenshot capabilities if needed

- ❌ **allure-behave** - Advanced test reporting
  - *Reason*: JUnit XML reports are sufficient for CI/CD
  - *Alternative*: Built-in behave reporting with JUnit XML output

- ❌ **ipdb** - Python debugger
  - *Reason*: Standard Python debugger is sufficient
  - *Alternative*: Use built-in `pdb` or IDE debugging

## Dependency Philosophy

**Principle**: Only include dependencies that are:
1. **Essential** for core functionality
2. **Well-maintained** and stable
3. **Minimal external system dependencies**
4. **Clear use case** in the codebase

**Benefits**:
- 🚀 Faster installation and startup
- 🔒 Reduced security surface area
- 🛠️ Easier dependency management
- 📦 Smaller virtual environment footprint
- 🎯 Clear separation of concerns

## Adding New Dependencies

Before adding a new dependency, ask:
1. Is this functionality already available in existing dependencies?
2. Can this be implemented with minimal code instead?
3. Is this dependency actively maintained?
4. Does this add significant value to justify the maintenance overhead?

## Verifying Dependencies

Run dependency verification:
```bash
./quick-start.sh install
```

This will:
- Create virtual environment if needed
- Install all required dependencies
- Verify critical imports work correctly
- Report any missing or failed installations