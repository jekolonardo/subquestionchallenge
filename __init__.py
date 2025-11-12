import datetime
from flask import Blueprint

from CTFd.models import Challenges, db, Flags, Solves, Hints
from CTFd.plugins import register_plugin_assets_directory
from CTFd.plugins.challenges import CHALLENGE_CLASSES, BaseChallenge
from CTFd.plugins.flags import get_flag_class
from CTFd.plugins.migrations import upgrade
from CTFd.utils.user import get_locale
from CTFd.utils.decorators import admins_only
from flask import render_template, request, jsonify, url_for


class SubQuestionChallengeModel(Challenges):
    __mapper_args__ = {"polymorphic_identity": "subquestionchallenge"}
    
    # 不需要額外的 id 欄位，因為我們繼承自 Challenges
    # 也不需要額外的表格
    
    def __init__(self, *args, **kwargs):
        super(SubQuestionChallengeModel, self).__init__(**kwargs)


class SubQuestionItem(db.Model):
    __tablename__ = "multiquestion_items"
    
    id = db.Column(db.Integer, primary_key=True)
    challenge_id = db.Column(db.Integer, db.ForeignKey('challenges.id', ondelete="CASCADE"))
    question_num = db.Column(db.Integer)
    question_text = db.Column(db.Text)
    points = db.Column(db.Integer, default=100)
    flag_id = db.Column(db.Integer, db.ForeignKey('flags.id', ondelete="CASCADE"))
    
    challenge = db.relationship("Challenges", foreign_keys="SubQuestionItem.challenge_id")
    flag = db.relationship("Flags", foreign_keys="SubQuestionItem.flag_id")

    def __init__(self, challenge_id, question_num, question_text, points, flag_id):
        self.challenge_id = challenge_id
        self.question_num = question_num
        self.question_text = question_text
        self.points = points
        self.flag_id = flag_id


class SubQuestionPartialSolve(db.Model):
    __tablename__ = "subquestion_partial_solves"
    __table_args__ = (db.UniqueConstraint('challenge_id', 'team_id', 'user_id', 'question_num'), {})
    
    id = db.Column(db.Integer, primary_key=True)
    challenge_id = db.Column(db.Integer, db.ForeignKey('challenges.id'))
    team_id = db.Column(db.Integer, db.ForeignKey('teams.id'))
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    question_num = db.Column(db.Integer)
    ip = db.Column(db.String(46))
    provided = db.Column(db.Text)
    date = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def __init__(self, challenge_id, team_id, user_id, question_num, ip, provided):
        self.challenge_id = challenge_id
        self.team_id = team_id
        self.user_id = user_id
        self.question_num = question_num
        self.ip = ip
        self.provided = provided


class SubQuestionChallengeType(BaseChallenge):
    id = "subquestionchallenge"  # Unique identifier used to register challenges
    name = "Sub Question Challenge"  # Name of a challenge type
    templates = {  # Templates used for each aspect of challenge editing & viewing
        "create": "/plugins/subquestionchallenge/assets/create.html",
        "update": "/plugins/subquestionchallenge/assets/update.html",
        "view": "/plugins/subquestionchallenge/assets/view.html",
    }
    scripts = {  # Scripts that are loaded when a template is loaded
        "create": "/plugins/subquestionchallenge/assets/create.js",
        "update": "/plugins/subquestionchallenge/assets/update.js",
        "view": "/plugins/subquestionchallenge/assets/view.js",
    }
    # Route at which files are accessible. This must be registered using register_plugin_assets_directory()
    route = "/plugins/subquestionchallenge/assets/"
    # Blueprint used to access the static_folder directory.
    blueprint = Blueprint(
        "subquestionchallenge",
        __name__,
        template_folder="templates",
        static_folder="assets",
    )
    challenge_model = SubQuestionChallengeModel

    @classmethod
    def create(cls, request):
        """
        This method is used to process the challenge creation request.
        """
        data = request.form or request.get_json()
        
        # Separate challenge data from flag data
        challenge_data = {}
        questions = {}  # question_num -> {text, points, flag_content}
        
        # Valid challenge fields based on the Challenges model
        valid_challenge_fields = {
            'name', 'description', 'connection_info', 'next_id', 
            'max_attempts', 'value', 'category', 'type', 'state', 'requirements'
        }
        
        for key, value in data.items():
            if key in valid_challenge_fields:
                challenge_data[key] = value
                continue

            parts = key.split('_')
            if len(parts) != 2 or not parts[1].isdigit():
                continue

            question_num = int(parts[1])
            
            if key.startswith('flag_') and value:
                if question_num not in questions:
                    questions[question_num] = {}
                questions[question_num]['flag_content'] = value
            elif key.startswith('question_') and value:
                if question_num not in questions:
                    questions[question_num] = {}
                questions[question_num]['text'] = value
            elif key.startswith('points_') and value:
                if question_num not in questions:
                    questions[question_num] = {}
                questions[question_num]['points'] = int(value)
        
        # Calculate total value from all questions and override the challenge value
        total_value = sum(q.get('points', 0) for q in questions.values())
        challenge_data['value'] = total_value
        
        # Ensure 'state' is correctly passed, default to 'hidden' if not present
        if 'state' not in challenge_data:
            challenge_data['state'] = 'hidden'

        # Create the basic challenge
        challenge = cls.challenge_model(**challenge_data)
        db.session.add(challenge)
        db.session.commit()
        
        # Create flags and question items
        for question_num, question_info in questions.items():
            if 'flag_content' in question_info and 'text' in question_info:
                # Create flag
                flag = Flags(
                    challenge_id=challenge.id,
                    content=question_info['flag_content'],
                    type='static'
                )
                db.session.add(flag)
                db.session.flush()  # Get the flag ID
                
                # Create question item
                question_item = SubQuestionItem(
                    challenge_id=challenge.id,
                    question_num=question_num,
                    question_text=question_info['text'],
                    points=question_info.get('points', 100),
                    flag_id=flag.id
                )
                db.session.add(question_item)
        
        db.session.commit()
        return challenge

    @classmethod
    def read(cls, challenge):
        """
        This method is used to access the data of a challenge in a format processable by the front end.
        """
        challenge = cls.challenge_model.query.filter_by(id=challenge.id).first()
        
        # Get all question items for this challenge
        question_items = SubQuestionItem.query.filter_by(challenge_id=challenge.id).order_by(SubQuestionItem.question_num).all()
        
        # Get user's solved questions
        from CTFd.utils.user import get_current_user, get_current_team
        solved_questions = set()
        user = get_current_user()
        team = get_current_team()
        
        if user:
            partial_solves = SubQuestionPartialSolve.query.filter_by(
                challenge_id=challenge.id,
                team_id=team.id if team else None,
                user_id=user.id
            ).all()
            solved_questions = {ps.question_num for ps in partial_solves}
        
        # Format questions data
        questions = []
        for item in question_items:
            questions.append({
                'num': item.question_num,
                'text': item.question_text,
                'points': item.points,
                'flag_id': item.flag_id,
                'solved': item.question_num in solved_questions
            })
        
        data = {
            "id": challenge.id,
            "name": challenge.name,
            "value": challenge.value,
            "description": challenge.description,
            "connection_info": challenge.connection_info,
            "next_id": challenge.next_id,
            "category": challenge.category,
            "state": challenge.state,
            "max_attempts": challenge.max_attempts,
            "type": challenge.type,
            "questions": questions,  # Add questions data
            "user_locale": {"zh_TW": "zh_Hant_TW"}.get(get_locale(), get_locale()), # Pass user's current locale to the frontend
            "type_data": {
                "id": cls.id,
                "name": cls.name,
                "templates": cls.templates,
                "scripts": cls.scripts,
            },
        }
        return data

    @classmethod
    def update(cls, challenge, request):
        """
        This method is used to update the information associated with a challenge.
        """
        data = request.form or request.get_json()

        # Check if this is a questions update
        if data.get('update_questions') == 'true':
            return cls._update_with_questions(challenge, data)

        # Regular update for basic challenge fields only
        for attr, value in data.items():
            # Skip fields that shouldn't be updated directly
            if attr in ("submit", "type", "update_questions"):
                continue
            # Skip question-related fields in basic update
            if attr.startswith(('question_', 'flag_', 'points_', 'flag_id_')):
                continue
            setattr(challenge, attr, value)

        db.session.commit()
        return challenge

    @classmethod
    def _update_with_questions(cls, challenge, data):
        """
        Handle updates that include question modifications.
        """
        # Separate challenge data from question data
        challenge_data = {}
        questions = {}  # question_num -> {text, points, flag_content, flag_id}

        # Valid challenge fields
        valid_challenge_fields = {
            'name', 'description', 'connection_info', 'next_id',
            'max_attempts', 'value', 'category', 'type', 'state', 'requirements'
        }

        for key, value in data.items():
            if key in valid_challenge_fields:
                challenge_data[key] = value
                continue

            # Skip special fields
            if key in ("submit", "type", "update_questions"):
                continue

            parts = key.split('_')
            if len(parts) < 2 or not parts[-1].isdigit():
                continue

            question_num = int(parts[-1])

            if key.startswith('flag_') and value:
                if question_num not in questions:
                    questions[question_num] = {}
                questions[question_num]['flag_content'] = value
            elif key.startswith('question_') and value:
                if question_num not in questions:
                    questions[question_num] = {}
                questions[question_num]['text'] = value
            elif key.startswith('points_') and value:
                if question_num not in questions:
                    questions[question_num] = {}
                questions[question_num]['points'] = int(value)
            elif key.startswith('flag_id_') and value:
                if question_num not in questions:
                    questions[question_num] = {}
                questions[question_num]['flag_id'] = int(value) if value.isdigit() else None

        # Calculate total value from all questions
        if questions:
            total_value = sum(q.get('points', 0) for q in questions.values())
            challenge_data['value'] = total_value

        # Update basic challenge fields
        for attr, value in challenge_data.items():
            setattr(challenge, attr, value)

        # Handle question updates
        cls._update_questions(challenge, questions)

        db.session.commit()
        return challenge

    @classmethod
    def _update_questions(cls, challenge, new_questions):
        """
        Update questions for a challenge, handling additions, modifications, and deletions.
        """
        # Safety check: if no questions provided, don't delete anything
        if not new_questions:
            print("WARNING: _update_questions called with empty questions data. Skipping to prevent accidental deletion.")
            return

        # Get existing questions
        existing_questions = SubQuestionItem.query.filter_by(challenge_id=challenge.id).all()
        existing_question_map = {q.question_num: q for q in existing_questions}

        # Track which questions we're keeping/updating
        updated_question_nums = set(new_questions.keys())
        existing_question_nums = set(existing_question_map.keys())

        # Delete questions that are no longer present
        questions_to_delete = existing_question_nums - updated_question_nums
        for question_num in questions_to_delete:
            question_item = existing_question_map[question_num]

            # Delete the associated flag first
            if question_item.flag_id:
                flag = Flags.query.filter_by(id=question_item.flag_id).first()
                if flag:
                    db.session.delete(flag)

            # Delete partial solves for this question
            SubQuestionPartialSolve.query.filter_by(
                challenge_id=challenge.id,
                question_num=question_num
            ).delete()

            # Delete the question item
            db.session.delete(question_item)

        # Update or create questions
        for question_num, question_data in new_questions.items():
            if 'text' not in question_data or 'flag_content' not in question_data:
                continue  # Skip incomplete questions

            existing_question = existing_question_map.get(question_num)

            if existing_question:
                # Update existing question
                existing_question.question_text = question_data['text']
                existing_question.points = question_data.get('points', 100)

                # Update the associated flag
                if existing_question.flag_id:
                    flag = Flags.query.filter_by(id=existing_question.flag_id).first()
                    if flag:
                        flag.content = question_data['flag_content']
                    else:
                        # Flag doesn't exist, create new one
                        new_flag = Flags(
                            challenge_id=challenge.id,
                            content=question_data['flag_content'],
                            type='static'
                        )
                        db.session.add(new_flag)
                        db.session.flush()
                        existing_question.flag_id = new_flag.id
                else:
                    # No flag associated, create new one
                    new_flag = Flags(
                        challenge_id=challenge.id,
                        content=question_data['flag_content'],
                        type='static'
                    )
                    db.session.add(new_flag)
                    db.session.flush()
                    existing_question.flag_id = new_flag.id
            else:
                # Create new question
                new_flag = Flags(
                    challenge_id=challenge.id,
                    content=question_data['flag_content'],
                    type='static'
                )
                db.session.add(new_flag)
                db.session.flush()

                new_question = SubQuestionItem(
                    challenge_id=challenge.id,
                    question_num=question_num,
                    question_text=question_data['text'],
                    points=question_data.get('points', 100),
                    flag_id=new_flag.id
                )
                db.session.add(new_question)

    @classmethod
    def attempt(cls, challenge, request):
        """
        This method is used to check whether a given input is right or wrong.
        """
        data = request.form or request.get_json()
        provided = data.get("submission", "").strip()
        question_num = data.get("question_num")
        
        #Debug: Print all received data (remove in production)
        print(f"DEBUG: Received data: {data}")
        print(f"DEBUG: question_num: {question_num}")
        print(f"DEBUG: submission: {provided}")
        
        # Immediately reject requests without question_num to prevent duplicate submissions
        if not question_num:
            print("DEBUG: Rejecting request without question_num")
            # Return a response that CTFd can handle instead of raising exception
            return False, "Multi-question challenges must be submitted via the question selection interface"
        
        try:
            question_num = int(question_num)
        except (ValueError, TypeError):
            return False, "Invalid question number"
        
        # Get the specific question item
        question_item = SubQuestionItem.query.filter_by(
            challenge_id=challenge.id, 
            question_num=question_num
        ).first()
        
        if not question_item:
            return False, "Question {num} does not exist".format(num=question_num)
        
        # Get the flag for this specific question
        flag = Flags.query.filter_by(id=question_item.flag_id).first()
        
        if not flag:
            return False, "This question has no flag set"
        
        # Check if the provided answer matches this question's flag
        flag_class = get_flag_class(flag.type)
        if flag_class.compare(flag, provided):
            # Record partial solve but don't mark challenge as complete yet
            from CTFd.utils.user import get_current_user, get_current_team
            user = get_current_user()
            team = get_current_team()
            
            # Check if this question was already solved
            existing_partial = SubQuestionPartialSolve.query.filter_by(
                challenge_id=challenge.id,
                team_id=team.id if team else None,
                user_id=user.id,
                question_num=question_num
            ).first()
            
            if not existing_partial:
                # Record this partial solve
                from CTFd.utils.user import get_ip
                partial_solve = SubQuestionPartialSolve(
                    challenge_id=challenge.id,
                    team_id=team.id if team else None,
                    user_id=user.id,
                    question_num=question_num,
                    ip=get_ip(request),
                    provided=provided
                )
                db.session.add(partial_solve)
                db.session.commit()
            
            # Check if all questions are now solved
            total_questions = SubQuestionItem.query.filter_by(challenge_id=challenge.id).count()
            solved_questions = SubQuestionPartialSolve.query.filter_by(
                challenge_id=challenge.id,
                team_id=team.id if team else None,
                user_id=user.id
            ).count()
            
            if solved_questions >= total_questions:
                return True, "Congratulations! You have completed all {total} questions!".format(
                    total=total_questions
                )
            else:
                return "partial", (
                    "Question {num} correct! {solved}/{total} questions completed"
                ).format(
                    num=question_num,
                    solved=solved_questions,
                    total=total_questions,
                )
        
        return False, "Question {num} is incorrect".format(num=question_num)

    @classmethod
    def solve(cls, user, team, challenge, request):
        """
        This method is used to insert Solves into the database.
        Only create solve record if ALL questions are completed.
        """
        # Double-check that all questions are indeed solved
        total_questions = SubQuestionItem.query.filter_by(challenge_id=challenge.id).count()
        solved_questions = SubQuestionPartialSolve.query.filter_by(
            challenge_id=challenge.id,
            team_id=team.id if team else None,
            user_id=user.id
        ).count()
        
        if solved_questions >= total_questions:
            # All questions solved, proceed with normal solve
            super().solve(user, team, challenge, request)
        else:
            # Not all questions solved, this shouldn't happen but let's be safe
            print(f"WARNING: solve() called for challenge {challenge.id} but only {solved_questions}/{total_questions} questions completed")

    @classmethod
    def delete(cls, challenge):
        """
        This method is used to delete the information associated with a challenge.
        """
        # Delete all question items first
        SubQuestionItem.query.filter_by(challenge_id=challenge.id).delete()
        
        # Delete partial solves
        SubQuestionPartialSolve.query.filter_by(challenge_id=challenge.id).delete()
        
        # Delete the challenge itself
        Challenges.query.filter_by(id=challenge.id).delete()
        
        # Delete solves for the parent challenge
        Solves.query.filter_by(challenge_id=challenge.id).delete()

        db.session.commit()

    @classmethod
    def fail(cls, user, team, challenge, request):
        """
        This method is used to insert wrong submissions into the database.
        """
        pass


@admins_only
def view_partial_solves(challenge_id):
    """
    View partial solves for a subquestion challenge
    """
    try:
        print(f"SubQuestion Challenge: Accessing partial solves for challenge {challenge_id}")

        challenge = Challenges.query.filter_by(id=challenge_id).first_or_404()
        print(f"SubQuestion Challenge: Found challenge {challenge.name}, type: {challenge.type}")

        # Only show partial solves for subquestion challenges
        if challenge.type != 'subquestionchallenge':
            print(f"SubQuestion Challenge: Wrong challenge type: {challenge.type}")
            return jsonify({'error': f'This challenge is not a subquestion challenge, it is: {challenge.type}'}), 400

        # Handle filtering
        field = request.args.get('field')
        q = request.args.get('q')
        print(f"SubQuestion Challenge: Filter field: {field}, query: {q}")

        # Start with base query
        query = db.session.query(SubQuestionPartialSolve)

        if not field or not q:
            # No filter specified, show only this challenge
            query = query.filter_by(challenge_id=challenge_id)
        else:
            # Apply filters
            if field == 'challenge_id':
                try:
                    filter_challenge_id = int(q)
                    query = query.filter_by(challenge_id=filter_challenge_id)
                except ValueError:
                    query = query.filter_by(challenge_id=-1)  # No results
            elif field == 'challenge_name':
                # We'll filter this after we get the data since we need to join with challenges
                pass
            elif field == 'account_id':
                try:
                    account_id = int(q)
                    query = query.filter(
                        (SubQuestionPartialSolve.team_id == account_id) |
                        (SubQuestionPartialSolve.user_id == account_id)
                    )
                except ValueError:
                    query = query.filter_by(team_id=-1, user_id=-1)  # No results
            elif field == 'account_name':
                # We'll filter this after we get account names
                pass
            elif field == 'question_num':
                try:
                    question_num = int(q)
                    query = query.filter_by(question_num=question_num)
                except ValueError:
                    query = query.filter_by(question_num=-1)  # No results
            elif field == 'provided':
                query = query.filter(SubQuestionPartialSolve.provided.ilike(f'%{q}%'))

        partial_solves = query.order_by(SubQuestionPartialSolve.date.desc()).all()
        print(f"SubQuestion Challenge: Found {len(partial_solves)} partial solves")

        # Get question details for all challenges that might appear
        challenge_ids = set([ps.challenge_id for ps in partial_solves])
        if challenge_id not in challenge_ids:
            challenge_ids.add(challenge_id)

        questions = db.session.query(SubQuestionItem).filter(
            SubQuestionItem.challenge_id.in_(challenge_ids)
        ).all()
        print(f"SubQuestion Challenge: Found {len(questions)} questions")

        question_map = {}
        challenge_map = {}
        for q_item in questions:
            question_map[(q_item.challenge_id, q_item.question_num)] = q_item.question_text
            if q_item.challenge_id not in challenge_map:
                challenge_obj = Challenges.query.filter_by(id=q_item.challenge_id).first()
                if challenge_obj:
                    challenge_map[q_item.challenge_id] = challenge_obj.name

        # Format partial solves for display
        formatted_solves = []
        for solve in partial_solves:
            from CTFd.models import Teams, Users

            account_name = "Unknown"
            account_url = "#"

            if solve.team_id:
                team = Teams.query.filter_by(id=solve.team_id).first()
                if team:
                    account_name = team.name
                    account_url = f"/admin/teams/{team.id}"
            elif solve.user_id:
                user = Users.query.filter_by(id=solve.user_id).first()
                if user:
                    account_name = user.name
                    account_url = f"/admin/users/{user.id}"

            solve_data = {
                'account_name': account_name,
                'account_url': account_url,
                'question_num': solve.question_num,
                'question_text': question_map.get((solve.challenge_id, solve.question_num), f"Question {solve.question_num}"),
                'provided': solve.provided,
                'date': solve.date,
                'ip': solve.ip,
                'challenge_id': solve.challenge_id,
                'challenge_name': challenge_map.get(solve.challenge_id, f"Challenge {solve.challenge_id}")
            }

            # Apply post-processing filters for fields that require joins
            skip_solve = False
            if field == 'challenge_name' and q:
                if q.lower() not in solve_data['challenge_name'].lower():
                    skip_solve = True
            elif field == 'account_name' and q:
                if q.lower() not in account_name.lower():
                    skip_solve = True

            if not skip_solve:
                formatted_solves.append(solve_data)

        if request.headers.get('Content-Type') == 'application/json':
            return jsonify({
                'success': True,
                'partial_solves': formatted_solves,
                'challenge_name': challenge.name
            })

    except Exception as e:
        print(f"SubQuestion Challenge: Error in view_partial_solves: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

    # Use the proper template file
    return render_template(
        'plugins/subquestionchallenge/assets/partial_solves_template.html',
        challenge=challenge,
        partial_solves=formatted_solves,
        field=field,
        q=q
    )


def load(app):
    print("<<<<< SubQuestionChallenge: Attempting to run upgrade() >>>>>", flush=True)
    upgrade(plugin_name="subquestionchallenge")
    print("<<<<< SubQuestionChallenge: Finished running upgrade() >>>>>", flush=True)

    # Register the blueprint and route
    app.register_blueprint(SubQuestionChallengeType.blueprint)
    app.add_url_rule(
        '/admin/challenges/<int:challenge_id>/partial-solves',
        'view_partial_solves',
        view_partial_solves,
        methods=['GET']
    )

    CHALLENGE_CLASSES["subquestionchallenge"] = SubQuestionChallengeType
    register_plugin_assets_directory(
        app, base_path="/plugins/subquestionchallenge/assets/"
    )

    # Add the partial solves button script to admin challenge pages
    @app.after_request
    def inject_partial_solves_script(response):
        try:
            # Only inject on admin challenge detail pages
            if (request.method == 'GET' and
                request.endpoint == 'admin.challenge_detail' and
                response.status_code == 200 and
                response.content_type and
                'text/html' in response.content_type):

                # Inject our script before the closing body tag
                script_tag = '''
<script>
console.log("SubQuestion Challenge: Script injected via after_request");
// Load the partial solves button script
var script = document.createElement('script');
script.src = '/plugins/subquestionchallenge/assets/partial_solves_button.js';
script.onload = function() { console.log('Partial solves button script loaded'); };
script.onerror = function() { console.error('Failed to load partial solves button script'); };
document.head.appendChild(script);
</script>'''

                response_data = response.get_data(as_text=True)
                if '</body>' in response_data:
                    response_data = response_data.replace('</body>', f'{script_tag}\n</body>')
                    response.set_data(response_data)
                    print(f"SubQuestion Challenge: Script injected into challenge detail page")

        except Exception as e:
            print(f"SubQuestion Challenge: Error injecting script: {e}")

        return response

    print("<<<<< SubQuestionChallenge: Plugin loaded successfully >>>>>", flush=True) 