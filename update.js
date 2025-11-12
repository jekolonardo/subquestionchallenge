CTFd.plugin.run((_CTFd) => {
    const $ = _CTFd.lib.$;

    if (typeof CTFd.translations === 'undefined') {
        CTFd.translations = {};
    }
    const __ = (str) => CTFd.translations[str] || str;

    let questionCount = 0;
    let usedQuestionNumbers = new Set();
    let originalQuestions = []; // Store original questions for comparison
    let currentQuestions = []; // Store current questions state

    function updateQuestionVisibility() {
        const questionItems = $('.question-item');
        const totalQuestions = questionItems.length;

        // Show/hide individual remove buttons
        if (totalQuestions > 1) {
            $('.remove-individual-question').show();
        } else {
            $('.remove-individual-question').hide();
        }
    }

    function getNextQuestionNumber() {
        let num = 1;
        while (usedQuestionNumbers.has(num)) {
            num++;
        }
        return num;
    }

    function renumberQuestions() {
        const questionItems = $('.question-item');
        usedQuestionNumbers.clear();

        questionItems.each(function(index) {
            const newNum = index + 1;
            const $item = $(this);

            usedQuestionNumbers.add(newNum);
            $item.attr('data-question', newNum);
            $item.find('h6').text(`Question ${newNum}`);
            $item.find('.remove-individual-question').attr('data-question', newNum);

            // Update form field names
            $item.find('.question-text').attr('name', `question_${newNum}`);
            $item.find('.question-flag').attr('name', `flag_${newNum}`);
            $item.find('.question-points').attr('name', `points_${newNum}`);
        });

        questionCount = questionItems.length;
    }

    function addQuestion(questionData = null) {
        const newQuestionNum = questionData ? questionData.num : getNextQuestionNumber();
        usedQuestionNumbers.add(newQuestionNum);

        const questionHtml = `
            <div class="question-item border p-3 mb-3" data-question="${newQuestionNum}" ${questionData ? `data-original-question="${questionData.num}"` : ''}>
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <h6 class="mb-0">Question ${newQuestionNum}</h6>
                    <button type="button" class="btn btn-sm btn-danger remove-individual-question" data-question="${newQuestionNum}">Remove</button>
                </div>
                <div class="form-group">
                    <label>Question Text</label>
                    <textarea class="form-control question-text" name="question_${newQuestionNum}" rows="3" placeholder="Enter question text" required>${questionData ? questionData.text : ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Flag</label>
                    <input type="text" class="form-control question-flag" name="flag_${newQuestionNum}" placeholder="Enter flag" ${questionData ? `value="${questionData.flag_content || ''}"` : ''} required>
                </div>
                <div class="form-group">
                    <label>Points</label>
                    <input type="number" class="form-control question-points" name="points_${newQuestionNum}" value="${questionData ? questionData.points : 100}" min="1" required>
                </div>
                ${questionData ? `<input type="hidden" class="question-flag-id" name="flag_id_${newQuestionNum}" value="${questionData.flag_id || ''}">` : ''}
            </div>
        `;

        $('#questions-container').append(questionHtml);
        questionCount++;
        updateQuestionVisibility();
    }

    // Load existing questions from challenge data
    function loadExistingQuestions() {
        // Get challenge data that should be available in the window.CHALLENGE_DATA or from CTFd.lib
        let challengeData = null;

        // Try to get challenge data from the API
        const challengeId = window.location.pathname.split('/').pop();

        _CTFd.fetch(`/api/v1/challenges/${challengeId}`)
            .then(response => response.json())
            .then(data => {
                if (data.success && data.data.questions) {
                    challengeData = data.data;
                    originalQuestions = [...challengeData.questions];

                    // Sort questions by question number to ensure correct order
                    const sortedQuestions = [...challengeData.questions].sort((a, b) => a.num - b.num);

                    // Populate questions container in order using async/await pattern
                    async function loadQuestionsInOrder() {
                        for (const question of sortedQuestions) {
                            try {
                                // Get flag content for this question
                                const flagResponse = await _CTFd.fetch(`/api/v1/flags/${question.flag_id}`);
                                const flagData = await flagResponse.json();

                                if (flagData.success) {
                                    question.flag_content = flagData.data.content;
                                }
                            } catch (error) {
                                console.warn('Could not load flag content for question', question.num, error);
                            }

                            // Add question to DOM (this will happen in sequential order)
                            addQuestion(question);
                        }
                    }

                    // Load questions in order
                    loadQuestionsInOrder();

                    usedQuestionNumbers = new Set(challengeData.questions.map(q => q.num));
                    questionCount = challengeData.questions.length;
                } else {
                    console.error('Failed to load challenge data:', data);
                    // Add one default question if no questions exist
                    addQuestion();
                }
            })
            .catch(error => {
                console.error('Error loading challenge data:', error);
                // Add one default question if loading fails
                addQuestion();
            });
    }

    // Add question button
    $(document).on('click', '#add-question', function() {
        addQuestion();
    });

    // Remove individual question button (using event delegation)
    $(document).on('click', '.remove-individual-question', function() {
        const questionToRemove = parseInt($(this).attr('data-question'));
        usedQuestionNumbers.delete(questionToRemove);

        $(this).closest('.question-item').remove();

        // Renumber all remaining questions to maintain sequential numbering
        renumberQuestions();
        updateQuestionVisibility();
    });

    // Override the main challenge update form submission to handle question updates
    const form = $('form');

    if (form.data('multi-question-update-bound')) {
        console.log("Multi Question Challenge update script already bound, skipping.");
        return;
    }
    form.data('multi-question-update-bound', true);

    form.off('submit').on('submit', function(e) {
        // Check if this form submission contains question data
        const formData = new FormData(this);
        let hasQuestionData = false;

        for (const [key, value] of formData.entries()) {
            if (key.startsWith('question_') || key.startsWith('flag_') || key.startsWith('points_')) {
                hasQuestionData = true;
                break;
            }
        }

        // If no question data, let the form submit normally (for hints, flags, etc.)
        if (!hasQuestionData) {
            console.log("No question data detected, allowing normal form submission.");
            return; // Let the form submit normally
        }

        // We have question data, so intercept and handle it
        e.preventDefault();
        e.stopImmediatePropagation();

        const submitButton = $('button[type="submit"]');
        submitButton.prop('disabled', true);

        // Collect form data
        const data = {};
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }

        // Add questions data flag to indicate this is a question update
        data['update_questions'] = 'true';

        const challengeId = window.location.pathname.split('/').pop();

        // Submit the update
        _CTFd.fetch(`/api/v1/challenges/${challengeId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Show success message and optionally reload
                alert(__('Challenge updated successfully!'));
                window.location.reload();
            } else {
                console.error('Update failed:', data);
                let error_message = __('Failed to update challenge. Please check all fields are filled correctly.');
                if (data.errors) {
                    error_message = Object.values(data.errors).join('\n');
                }
                alert(error_message);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert(__('An error occurred while updating the challenge'));
        })
        .finally(() => {
            submitButton.prop('disabled', false);
        });
    });

    // Initialize tooltips
    $('[data-toggle="tooltip"]').tooltip();

    // Load existing questions when page loads
    $(document).ready(function() {
        loadExistingQuestions();
    });

    console.log("Multi Question Challenge update script loaded.");

    // Also try to add the partial solves button when this script loads
    // This will work when we're on the challenge update/detail page
    function addPartialSolvesButtonFromUpdate() {
        console.log('SubQuestion update.js: Trying to add partial solves button');

        // Check if we're on the admin challenge detail page
        if (!window.location.pathname.includes('/admin/challenges/')) {
            return;
        }

        // Get challenge ID
        const challengeId = window.location.pathname.split('/').pop();
        console.log('Challenge ID:', challengeId);

        // Find the button container
        const buttonContainer = document.querySelector('.jumbotron .pt-3');
        if (!buttonContainer) {
            console.log('Button container not found');
            return;
        }

        // Check if button already exists
        if (document.querySelector('.partial-solves-button')) {
            console.log('Partial solves button already exists');
            return;
        }

        // Find the "Correct Submissions" button
        const correctSubmissionsButton = buttonContainer.querySelector('a[href*="/admin/submissions/correct"]');
        if (!correctSubmissionsButton) {
            console.log('Correct submissions button not found');
            return;
        }

        // Create the partial solves button
        const partialSolvesButton = document.createElement('a');
        partialSolvesButton.className = 'no-decoration partial-solves-button';
        partialSolvesButton.href = `/admin/challenges/${challengeId}/partial-solves`;

        partialSolvesButton.innerHTML = `
            <i class="btn-fa fas fa-clipboard-list fa-2x px-2"
               data-toggle="tooltip"
               data-placement="top"
               title="View Partial Solves (Question Answers)"></i>
        `;

        // Insert the button after the correct submissions button
        correctSubmissionsButton.parentNode.insertBefore(
            partialSolvesButton,
            correctSubmissionsButton.nextSibling
        );

        // Initialize tooltip
        if (window.$ && window.$().tooltip) {
            window.$(partialSolvesButton.querySelector('[data-toggle="tooltip"]')).tooltip();
        }

        console.log('SubQuestion update.js: Partial solves button added successfully');
    }

    // Try to add the button when this script loads
    setTimeout(addPartialSolvesButtonFromUpdate, 500);

    console.log("Multi Question Challenge update script loaded.");
}); 