# AI Matching Examples - Title Importance

## Example 1: Strong Match (Confidence: 0.95)

**Bug Title:** 
```
508c | Form | Test Project | No aria-required for required fields
```

**Bug Description:**
```
The form has required fields but they are not marked with aria-required="true". 
Screen readers cannot identify which fields are required.
```

**AI Analysis:**
- **Keywords extracted:** 508c, Form, aria-required, required fields
- **Accessibility category:** Form accessibility, ARIA attributes
- **Matched Test Case:** "C - Required fields are coded with the aria-required attribute"
- **Reasoning:** Bug title explicitly mentions "aria-required" and "required fields" which directly matches the test case title. Test validates this exact requirement.
- **Confidence:** 0.95

---

## Example 2: Good Match (Confidence: 0.85)

**Bug Title:**
```
508c | Page Titled | Test Project | Page title is not meaningful
```

**Bug Description:**
```
Current page title is generic "Home" instead of describing page purpose.
```

**AI Analysis:**
- **Keywords extracted:** 508c, Page Titled, meaningful title
- **Accessibility category:** Page title requirements
- **Matched Test Case:** "A - There is no meaningful page title in plain language"
- **Reasoning:** Bug about page title meaningfulness matches test that checks for meaningful page titles. Title keywords align well.
- **Confidence:** 0.85

---

## Example 3: Moderate Match (Confidence: 0.70)

**Bug Title:**
```
Login button not accessible
```
*(Vague title, no 508c criteria, no specific attribute mentioned)*

**Bug Description:**
```
Login button cannot be activated with keyboard, only mouse clicks work.
```

**AI Analysis:**
- **Keywords extracted:** Login, button, accessible
- **Accessibility category:** Keyboard navigation (inferred from description)
- **Matched Test Case:** "Verify keyboard navigation for form controls"
- **Reasoning:** Title is vague but description indicates keyboard issue. Matches keyboard navigation test but confidence lower due to unclear title.
- **Confidence:** 0.70

**Improvement:** Better title would be:
```
508c | Keyboard | Login button not activatable via keyboard
```

---

## Example 4: Before vs After Title Improvement

### Before (Poor Title)
```
Bug Title: "Issue with image"
Description: "Image doesn't work with screen readers"
AI Match: Multiple possible tests (form images, content images, decorative images)
Confidence: 0.55 (Multiple candidates, unclear which)
```

### After (Good Title)
```
Bug Title: "508c | Images | Missing alt attribute on logo image"
Description: "Company logo image at top of page has no alt text"
AI Match: "A - Meaningful images have an alt attribute"
Confidence: 0.92 (Clear match based on "alt attribute" in title)
```

**Result:** 67% confidence increase just from better title!

---

## Real-World Comparison

### Scenario: 10 Bugs Processed

| Bug # | Title Quality | AI Confidence | Correct Match? |
|-------|---------------|---------------|----------------|
| 1 | Excellent (508c + criteria) | 0.95 | ✅ Yes |
| 2 | Excellent (508c + attribute) | 0.93 | ✅ Yes |
| 3 | Good (attribute mentioned) | 0.88 | ✅ Yes |
| 4 | Good (component + issue) | 0.85 | ✅ Yes |
| 5 | Moderate (vague, but desc clear) | 0.72 | ✅ Yes |
| 6 | Poor (very vague) | 0.58 | ❌ No (needed correction) |
| 7 | Excellent (508c + specific) | 0.96 | ✅ Yes |
| 8 | Good (WCAG reference) | 0.87 | ✅ Yes |
| 9 | Moderate (generic) | 0.68 | ✅ Yes (lucky) |
| 10 | Poor (no context) | 0.52 | ❌ No (needed correction) |

**Statistics:**
- **Excellent/Good titles (1-4, 7-8):** 100% accuracy, avg confidence 0.90
- **Moderate titles (5, 9):** 100% accuracy, avg confidence 0.70
- **Poor titles (6, 10):** 0% accuracy, avg confidence 0.55

**Conclusion:** Good bug titles with 508c criteria and specific attributes achieve 30-40% higher confidence and near-perfect matching accuracy!

---

## Title Templates for Best Results

### For ARIA Issues
```
508c | [Component] | Missing/Incorrect [aria-attribute] on [element]
Example: 508c | Form | Missing aria-required on email field
```

### For Keyboard Issues
```
508c | Keyboard | [Element] not accessible via [interaction]
Example: 508c | Keyboard | Modal dialog not closable with Escape key
```

### For Screen Reader Issues
```
508c | Screen Reader | [Element] not announced/labeled correctly
Example: 508c | Screen Reader | Error messages not announced in forms
```

### For Visual/Color Issues
```
508c | Color Contrast | [Element] fails contrast requirements
Example: 508c | Color Contrast | Link text insufficient contrast ratio
```

### For Semantic HTML Issues
```
508c | Semantic HTML | [Element] using incorrect/missing element type
Example: 508c | Semantic HTML | Table data not using proper th headers
```

---

## Benefits of Good Bug Titles

✅ **Higher AI Confidence:** 0.85-0.95 vs 0.50-0.70
✅ **Fewer Corrections Needed:** ~95% accurate vs ~50% accurate
✅ **Faster Processing:** AI finds match immediately
✅ **Better Learning:** AI learns patterns more effectively
✅ **Clearer Communication:** Team understands issue instantly
✅ **Easier Tracking:** Can filter/search by criteria/component
