// Partial Solves Page JavaScript
(function() {
    'use strict';

    // Copy flag functionality
    document.addEventListener('DOMContentLoaded', function() {
        console.log('Partial Solves: Page loaded');

        // Initialize tooltips
        if (window.$ && window.$().tooltip) {
            $('[data-toggle="tooltip"]').tooltip();
        }

        // Copy to clipboard functionality
        $('.copy-flag').on('click', function() {
            const text = $(this).data('clipboard-text');
            if (navigator.clipboard) {
                navigator.clipboard.writeText(text).then(function() {
                    // Show temporary success feedback
                    const icon = $(this).find('i');
                    const originalClass = icon.attr('class');
                    icon.removeClass('fa-clipboard').addClass('fa-check text-success');
                    setTimeout(() => {
                        icon.attr('class', originalClass);
                    }, 1000);
                }.bind(this));
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);

                // Show feedback
                const icon = $(this).find('i');
                const originalClass = icon.attr('class');
                icon.removeClass('fa-clipboard').addClass('fa-check text-success');
                setTimeout(() => {
                    icon.attr('class', originalClass);
                }, 1000);
            }
        });

        // Format timestamps (enhanced with relative time if needed)
        const timeElements = document.querySelectorAll('[data-time]');
        timeElements.forEach(function(element) {
            const isoTime = element.getAttribute('data-time');
            const date = new Date(isoTime);
            // Keep the formatted display as is for now
            // Could be enhanced with relative time (e.g., "2 hours ago")
        });

        // Handle search form submission
        const searchForm = document.querySelector('form.search-form');
        if (searchForm) {
            searchForm.addEventListener('submit', function(e) {
                const fieldSelect = this.querySelector('[name="field"]');
                const queryInput = this.querySelector('[name="q"]');

                if (!queryInput.value.trim()) {
                    e.preventDefault();
                    alert('Please enter a search term');
                    return false;
                }
            });
        }

        console.log('Partial Solves: JavaScript initialized');
    });

})();