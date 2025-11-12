CTFd.plugin.run((_CTFd) => {
    const $ = _CTFd.lib.$;
    
    if (typeof CTFd.translations === 'undefined') {
        CTFd.translations = {};
    }
    const __ = (str) => CTFd.translations[str] || str;
    
    let questionCount = 1;
    let usedQuestionNumbers = new Set([1]); // Track which numbers are in use

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

    // Add question button
    $('#add-question').click(function() {
        const newQuestionNum = getNextQuestionNumber();
        usedQuestionNumbers.add(newQuestionNum);

        const questionHtml = `
            <div class="question-item border p-3 mb-3" data-question="${newQuestionNum}">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <h6 class="mb-0">Question ${newQuestionNum}</h6>
                    <button type="button" class="btn btn-sm btn-danger remove-individual-question" data-question="${newQuestionNum}">Remove</button>
                </div>
                <div class="form-group">
                    <label>Question Text</label>
                    <textarea class="form-control question-text" name="question_${newQuestionNum}" rows="3" placeholder="Enter question text" required></textarea>
                </div>
                <div class="form-group">
                    <label>Flag</label>
                    <input type="text" class="form-control question-flag" name="flag_${newQuestionNum}" placeholder="Enter flag" required>
                </div>
                <div class="form-group">
                    <label>Points</label>
                    <input type="number" class="form-control question-points" name="points_${newQuestionNum}" value="100" min="1" required>
                </div>
            </div>
        `;

        $('#questions-container').append(questionHtml);
        questionCount++;
        updateQuestionVisibility();
    });

    // Remove individual question button (using event delegation for dynamically added buttons)
    $(document).on('click', '.remove-individual-question', function() {
        const questionToRemove = parseInt($(this).attr('data-question'));
        usedQuestionNumbers.delete(questionToRemove);

        $(this).closest('.question-item').remove();

        // Renumber all remaining questions to maintain sequential numbering
        renumberQuestions();
        updateQuestionVisibility();
    });

    // Initialize visibility
    updateQuestionVisibility();
    
    // Ensure challenge type is set correctly
    $('#chaltype').val('subquestionchallenge');
    
    // The form submission is completely overridden by this script.
    // We use a flag to prevent re-binding and multiple submissions.
    const form = $('form[action="/admin/challenges/new"], form[x-action="create_challenge"]');
    
    if (form.data('multi-question-bound')) {
        console.log("Multi Question Challenge create script already bound, skipping.");
        return;
    }
    form.data('multi-question-bound', true);

    // Detach all existing submit handlers to prevent duplicate submissions
    form.off('submit');

    form.on('submit', function(e) {
        e.preventDefault();
        e.stopImmediatePropagation();

        const submitButton = $('.create-challenge-submit');
        submitButton.prop('disabled', true);
        
        // Validate required fields
        const name = $('input[name="name"]').val();
        const category = $('input[name="category"]').val();
        const description = $('textarea[name="description"]').val();
        
        if (!name || !category) {
            alert(__('Please fill out the challenge name and category'));
            return;
        }
        
        // Check if we have at least one question
        const question1 = $('textarea[name="question_1"]').val();
        const flag1 = $('input[name="flag_1"]').val();
        
        if (!question1 || !flag1) {
            alert(__('Please fill out at least one question and its corresponding flag'));
            return;
        }
        
        // Collect all form data into a JSON object
        const data = {};
        const formData = new FormData(this);
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }

        // Ensure the challenge type is set correctly
        data['type'] = 'subquestionchallenge';
        
        // Use CTFd.fetch to submit to the correct API endpoint
        _CTFd.fetch('/api/v1/challenges', {
            method: 'POST',
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                // Handle non-ok responses
                return response.json().then(err => { throw err; });
            }
        })
        .then(response => {
            if (response.success) {
                // Redirect to challenges page on success
                window.location.href = '/admin/challenges';
            } else {
                console.error('Create failed:', response);
                let error_message = __('Failed to create challenge. Please check all fields are filled correctly.');
                if (response.errors) {
                    error_message = Object.values(response.errors).join('\n');
                }
                alert(error_message);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert(__('An error occurred while creating the challenge'));
        })
        .finally(() => {
            submitButton.prop('disabled', false); // Re-enable button
        });
    });
    
    // We no longer need a separate click handler for the button,
    // as the form's submit event is now the single source of truth.
    $('.create-challenge-submit').off('click');
    
    console.log("Multi Question Challenge create script loaded and form submission overridden.");
}); 