CTFd.plugin.run((_CTFd) => {
    const $ = _CTFd.lib.$;

    if (typeof CTFd.translations === 'undefined') {
        CTFd.translations = {};
    }
    const __ = (str) => CTFd.translations[str] || str;

    let questionCount = 0;

    // Load existing questions when page loads
    $(document).ready(function() {
        console.log('Multi Question Challenge update script initializing...');
        console.log('Questions container found:', $('#questions-container').length > 0);
        console.log('Add question button found:', $('#add-question').length > 0);
        loadExistingQuestions();
    });

    // Load existing questions from the challenge
    function loadExistingQuestions() {
        // Try multiple ways to get challenge ID from the update page
        let challengeId = null;

        // Method 1: From form hidden input or any ID field
        challengeId = $('input[name="id"]').val() || $('input[name="challenge_id"]').val();

        // Method 2: From URL path (e.g., /admin/challenges/123/update)
        if (!challengeId) {
            const pathMatch = window.location.pathname.match(/\/admin\/challenges\/(\d+)/);
            if (pathMatch) {
                challengeId = pathMatch[1];
            }
        }

        // Method 3: From any challenge ID input or data attribute
        if (!challengeId) {
            challengeId = $('#challenge-id').val() || $('[data-challenge-id]').attr('data-challenge-id');
        }

        console.log('Detected challenge ID:', challengeId);

        if (!challengeId) {
            console.error('Challenge ID not found');
            // Still show the add question interface even if we can't load existing questions
            addQuestionField(1);
            questionCount = 1;
            return;
        }

        // Fetch challenge data to get existing questions
        _CTFd.fetch(`/api/v1/challenges/${challengeId}`, {
            method: 'GET',
            credentials: 'same-origin'
        })
        .then(response => response.json())
        .then(data => {
            console.log('API response:', data);
            if (data.success && data.data && data.data.questions) {
                const questions = data.data.questions.sort((a, b) => a.num - b.num);
                questionCount = questions.length;

                // Clear container
                $('#questions-container').empty();

                // Add each existing question
                questions.forEach(question => {
                    const flagContent = question.flag_content || '[Click to edit flag]';
                    addQuestionField(question.num, question.text, question.points, flagContent);
                });

                // Show/hide remove button
                if (questionCount > 1) {
                    $('#remove-question').show();
                }
                console.log(`Loaded ${questionCount} existing questions`);
            } else {
                console.log('No existing questions found, starting with default question');
                // Add a default question field
                addQuestionField(1);
                questionCount = 1;
            }
        })
        .catch(error => {
            console.error('Error loading existing questions:', error);
            // Add a default question field even if loading fails
            addQuestionField(1);
            questionCount = 1;
        });
    }

    // Get flag content for a flag ID
    function getFlagContent(flagId) {
        // We'll need to make a separate API call to get flag content
        // For now, we'll show a placeholder that the user can edit
        return '[Edit flag content]';
    }

    // Add a new question field
    function addQuestionField(questionNum, questionText = '', points = 100, flagContent = '') {
        const questionHtml = `
            <div class="question-item border p-3 mb-3" data-question="${questionNum}">
                <div class="form-group">
                    <label>Question ${questionNum}</label>
                    <textarea class="form-control question-text" name="question_${questionNum}" rows="3" placeholder="Enter question text" required>${questionText}</textarea>
                </div>
                <div class="form-group">
                    <label>Flag ${questionNum}</label>
                    <input type="text" class="form-control question-flag" name="flag_${questionNum}" placeholder="Enter flag" value="${flagContent}" required>
                </div>
                <div class="form-group">
                    <label>Points</label>
                    <input type="number" class="form-control question-points" name="points_${questionNum}" value="${points}" min="1" required>
                </div>
            </div>
        `;

        $('#questions-container').append(questionHtml);
        updateTotalValue();
    }

    // Add question button handler
    $('#add-question').click(function() {
        questionCount++;
        addQuestionField(questionCount);

        // Show remove button if more than 1 question
        if (questionCount > 1) {
            $('#remove-question').show();
        }
    });

    // Remove question button handler
    $('#remove-question').click(function() {
        if (questionCount > 1) {
            $('.question-item').last().remove();
            questionCount--;

            // Hide remove button if only 1 question left
            if (questionCount <= 1) {
                $('#remove-question').hide();
            }
            updateTotalValue();
        }
    });

    // Update total value when points change
    $(document).on('input', '.question-points', function() {
        updateTotalValue();
    });

    // Calculate and update total value
    function updateTotalValue() {
        let total = 0;
        $('.question-points').each(function() {
            const value = parseInt($(this).val()) || 0;
            total += value;
        });
        $('#challenge-value').val(total);
        $('input[name="value"]').val(total);
    }

    // Ensure challenge type is set correctly
    $('#chaltype').val('multiquestionchallenge');

    // Override form submission to handle questions
    const form = $('form');

    if (form.data('multi-question-update-bound')) {
        console.log("Multi Question Challenge update script already bound, skipping.");
        return;
    }
    form.data('multi-question-update-bound', true);

    // Store original submit handler
    const originalSubmitHandler = form[0].onsubmit;

    form.off('submit').on('submit', function(e) {
        console.log('Form submission intercepted');
        e.preventDefault();
        e.stopImmediatePropagation();

        const submitButton = $('.btn[type="submit"]');
        submitButton.prop('disabled', true);

        // Validate required fields
        const name = $('input[name="name"]').val();
        const category = $('input[name="category"]').val();

        if (!name || !category) {
            alert(__('Please fill out the challenge name and category'));
            submitButton.prop('disabled', false);
            return;
        }

        // Check if we have at least one question
        if (questionCount === 0 || !$('textarea[name="question_1"]').val() || !$('input[name="flag_1"]').val()) {
            alert(__('Please fill out at least one question and its corresponding flag'));
            submitButton.prop('disabled', false);
            return;
        }

        // Collect all form data
        const data = {};
        const formData = new FormData(this);
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }

        // Ensure the challenge type is set correctly
        data['type'] = 'multiquestionchallenge';

        const challengeId = data['id'] || window.location.pathname.match(/\/admin\/challenges\/(\d+)/)?.[1];

        console.log('Submitting data:', data);
        console.log('Challenge ID:', challengeId);

        if (!challengeId) {
            alert(__('Could not determine challenge ID. Please try again.'));
            submitButton.prop('disabled', false);
            return;
        }

        // Use CTFd.fetch to submit to the correct API endpoint
        _CTFd.fetch(`/api/v1/challenges/${challengeId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        })
        .then(response => {
            console.log('Response status:', response.status);
            if (response.ok) {
                return response.json();
            } else {
                // Handle non-ok responses
                return response.json().then(err => {
                    console.error('Server error response:', err);
                    throw err;
                });
            }
        })
        .then(response => {
            console.log('Success response:', response);
            if (response.success) {
                // Show success message before redirect
                alert(__('Challenge updated successfully!'));
                // Redirect to challenges page on success
                window.location.href = '/admin/challenges';
            } else {
                console.error('Update failed:', response);
                let error_message = __('Failed to update challenge. Please check all fields are filled correctly.');
                if (response.errors) {
                    error_message = Object.values(response.errors).join('\n');
                }
                alert(error_message);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            // Try to fall back to standard form submission
            console.log('Attempting fallback to standard form submission...');
            submitButton.prop('disabled', false);

            // Remove our event handler and submit normally
            form.off('submit');
            alert(__('Attempting to save using standard method...'));
            this.submit();
        })
        .finally(() => {
            submitButton.prop('disabled', false); // Re-enable button
        });
    });

    // Initialize tooltips
    $('[data-toggle="tooltip"]').tooltip();

    console.log("Multi Question Challenge update script loaded");
}); 