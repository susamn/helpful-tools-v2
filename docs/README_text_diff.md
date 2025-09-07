# Text Diff Tool - Testing Documentation

## Overview

The Text Diff Tool includes comprehensive test suites to ensure reliability and functionality. This document explains how to run the tests and what they cover.

## Test Files

### 1. `test_text_diff.py` - Backend API Tests
Tests the Python Flask backend functionality:
- API endpoint validation
- Diff generation algorithms
- Character-level diff detection
- Edge cases and error handling
- Unicode and whitespace handling

### 2. `test_text_diff_frontend.py` - Frontend Integration Tests
Tests the HTML/JavaScript frontend using Selenium:
- UI element interaction
- Text comparison functionality
- History management
- Keyboard shortcuts
- Error handling
- Responsive design

### 3. `run_diff_tests.py` - Test Runner
Automated test runner that:
- Checks dependencies
- Runs backend tests
- Starts test server
- Runs frontend tests
- Provides comprehensive results

## Running Tests

### Quick Start
```bash
# Run all tests
python run_diff_tests.py
```

### Individual Test Suites

#### Backend Tests Only
```bash
pytest test_text_diff.py -v
```

#### Frontend Tests Only (requires running server)
```bash
# Terminal 1: Start server
python main.py

# Terminal 2: Run frontend tests
python test_text_diff_frontend.py
```

## Prerequisites

### Required Python Packages
```bash
pip install pytest flask requests
```

### Optional (for frontend tests)
```bash
pip install selenium
```

### Browser Drivers
For frontend tests, install one of:
- ChromeDriver (for Chrome)
- GeckoDriver (for Firefox)

## Test Coverage

### Backend Tests Cover:
- ✅ Basic text comparison
- ✅ Identical text handling
- ✅ Empty text scenarios
- ✅ Missing data validation
- ✅ Invalid JSON handling
- ✅ Multiline text changes
- ✅ Character-level diffs
- ✅ Line insertions/deletions
- ✅ Text replacements
- ✅ Very long texts
- ✅ Unicode characters
- ✅ Whitespace differences
- ✅ Newline variations

### Frontend Tests Cover:
- ✅ Page loading
- ✅ Text input functionality
- ✅ Compare button operation
- ✅ Clear functionality
- ✅ Swap functionality
- ✅ Copy diff feature
- ✅ Keyboard shortcuts
- ✅ History save/load
- ✅ Error handling
- ✅ Responsive design

## Test Results Interpretation

### Success Indicators
- ✅ All backend API tests pass
- ✅ Manual API test succeeds
- ✅ Frontend interactions work
- ✅ No JavaScript errors
- ✅ History functionality works

### Common Issues
- ❌ **Server not starting**: Check port 5000 availability
- ❌ **Browser driver missing**: Install ChromeDriver/GeckoDriver
- ❌ **Import errors**: Install missing dependencies
- ❌ **Network timeouts**: Increase wait times in tests

## Performance Benchmarks

The tests include performance validation for:
- Large text files (1000+ lines)
- Unicode text processing
- Real-time diff generation
- History storage efficiency

## Continuous Integration

For CI/CD pipelines:
```bash
# Install test dependencies
pip install pytest selenium requests

# Run backend tests only (CI-friendly)
pytest test_text_diff.py -v --tb=short

# Run with coverage
pytest test_text_diff.py --cov=main --cov-report=html
```

## Manual Testing Checklist

After running automated tests, manually verify:

1. **Basic Functionality**
   - [ ] Page loads without errors
   - [ ] Text inputs accept input
   - [ ] Compare shows differences
   - [ ] Clear resets inputs
   - [ ] Swap exchanges texts

2. **Visual Validation**
   - [ ] Character-level diffs highlighted
   - [ ] Line numbers displayed correctly
   - [ ] Stats show accurate counts
   - [ ] Responsive on mobile

3. **Advanced Features**
   - [ ] History saves/loads correctly
   - [ ] Copy diff works
   - [ ] Keyboard shortcuts functional
   - [ ] Error messages helpful

## Troubleshooting

### Test Failures

**Backend tests fail:**
- Check Flask app imports correctly
- Verify difflib is available
- Ensure test data is valid

**Frontend tests fail:**
- Confirm server is running on port 5000
- Check browser driver installation
- Verify Selenium version compatibility

### Performance Issues

**Slow diff generation:**
- Test with smaller text samples first
- Check memory usage with large files
- Optimize diff algorithms if needed

**UI lag:**
- Test with different browsers
- Check for memory leaks
- Validate CSS performance

## Contributing

When adding new features:
1. Write corresponding tests
2. Update test documentation
3. Run full test suite
4. Verify CI/CD compatibility

## Support

If tests fail consistently:
1. Check system requirements
2. Verify dependency versions
3. Review error logs
4. Test with minimal examples