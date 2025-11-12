// Add Partial Solves button for subquestion challenges
(function() {
    'use strict';

    console.log('SubQuestion Challenge: Partial solves button script loaded');
    console.log('Current URL:', window.location.pathname);

    // Only run on challenge detail pages
    if (!window.location.pathname.includes('/admin/challenges/')) {
        console.log('Not on admin challenges page, skipping');
        return;
    }

    // Check if this is a subquestion challenge
    function isSubQuestionChallenge() {
        // Try multiple selectors to find the challenge type
        const selectors = [
            '.jumbotron .text-center:nth-child(4)',
            '.jumbotron h2:nth-child(4)',
            '.jumbotron h2:contains("subquestionchallenge")',
            '.jumbotron .text-center'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            console.log(`Checking selector "${selector}":`, elements.length, 'elements found');

            for (const element of elements) {
                console.log('Element text content:', element.textContent.trim());
                if (element.textContent.trim() === 'subquestionchallenge') {
                    console.log('Found subquestionchallenge type!');
                    return true;
                }
            }
        }

        // Also check in the entire jumbotron
        const jumbotron = document.querySelector('.jumbotron');
        if (jumbotron) {
            console.log('Jumbotron content:', jumbotron.textContent);
            return jumbotron.textContent.includes('subquestionchallenge');
        }

        console.log('This is not a subquestion challenge');
        return false;
    }

    // Add the partial solves button
    function addPartialSolvesButton() {
        console.log('Attempting to add partial solves button...');

        const buttonContainer = document.querySelector('.jumbotron .pt-3');
        console.log('Button container found:', !!buttonContainer);

        if (!buttonContainer) {
            // Try alternative selectors
            const alternatives = ['.jumbotron div:last-child', '.jumbotron .pt-3', '.btn-fa'];
            for (const alt of alternatives) {
                const altContainer = document.querySelector(alt);
                if (altContainer) {
                    console.log(`Alternative container found with selector: ${alt}`);
                    break;
                }
            }
            console.log('Button container not found - cannot add button');
            return;
        }

        // Get challenge ID from the URL or global variable
        let challengeId;
        if (typeof CHALLENGE_ID !== 'undefined') {
            challengeId = CHALLENGE_ID;
            console.log('Challenge ID from global variable:', challengeId);
        } else {
            // Try to extract from URL
            const pathParts = window.location.pathname.split('/');
            const challengeIndex = pathParts.indexOf('challenges');
            if (challengeIndex >= 0 && pathParts[challengeIndex + 1]) {
                challengeId = pathParts[challengeIndex + 1];
                console.log('Challenge ID from URL:', challengeId);
            }
        }

        if (!challengeId) {
            console.log('Challenge ID not found in global variable or URL');
            console.log('URL parts:', window.location.pathname.split('/'));
            return;
        }

        // Check if button already exists
        if (document.querySelector('.partial-solves-button')) {
            console.log('Partial solves button already exists');
            return;
        }

        // Find the "Correct Submissions" button to insert after it
        const correctSubmissionsButton = buttonContainer.querySelector('a[href*="/admin/submissions/correct"]');
        console.log('Correct submissions button found:', !!correctSubmissionsButton);

        if (!correctSubmissionsButton) {
            console.log('Correct submissions button not found - checking all links in container:');
            const allLinks = buttonContainer.querySelectorAll('a');
            allLinks.forEach((link, index) => {
                console.log(`Link ${index}:`, link.href, link.innerHTML);
            });
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

        console.log('Partial solves button added for subquestion challenge');
    }

    // Wait for page to load and then add button if needed
    function init() {
        if (isSubQuestionChallenge()) {
            addPartialSolvesButton();
        }
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Also try to run after a short delay in case elements aren't ready yet
    setTimeout(init, 500);

})();