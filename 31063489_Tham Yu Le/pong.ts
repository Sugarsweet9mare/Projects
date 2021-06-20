import { interval, fromEvent} from 'rxjs'
import { map, scan, filter, merge, flatMap, takeUntil} from 'rxjs/operators'

type Key = "ArrowUp" | "ArrowDown" | "KeyR"
type Event = "keydown" | "keyup"
type ViewType = "paddle" | "ball"

const 
  // Constant values declred for easy access 
  Constants = new class{
    readonly CanvasSize = 600;
    readonly StartTime = 0;
    readonly StartBallRadius = 5;
    readonly PaddleWidth = 10;
    readonly PaddleHeight = 60;
    readonly WinScore = 7;
    readonly White = "#FFFFFF";
  }

function pong() {
  // Inside this function you will use the classes and functions 
  // from rx.js
  // to add visuals to the svg element in pong.html, animate them, and make them interactive.
  // Study and complete the tasks in observable exampels first to get ideas.
  // Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/ 
  // You will be marked on your functional programming style
  // as well as the functionality that you implement.
  // Document your code! 
  
  // Class that directional keys return, specifying the amount to move 
  class Direction { constructor(public readonly direction:number) {}}

  // Class constructed when a new game is start 
  class NewGameTrigger {constructor() {}}

  const 
    // Canvas element
    svg = document.getElementById("canvas")!,
    
    // Observable to read movement inputs
    keyObservable = <T>(e:Event, k:Key, result:()=>T)=>
      fromEvent<KeyboardEvent>(document,e)
        .pipe(
          filter(({code})=>code === k),
          filter(({repeat})=>!repeat)).pipe(
            flatMap(d=>interval(10).pipe(
              takeUntil(fromEvent<KeyboardEvent>(document, 'keyup').pipe(
                filter(({key})=>key === d.key)
              )),
              map(_=>d))
            ), map(result)
          ),
    startUp = keyObservable('keydown','ArrowUp',()=>new Direction(-5)),
    startDown = keyObservable('keydown','ArrowDown',()=>new Direction(5)),
    stopUp = keyObservable('keyup','ArrowUp',()=>new Direction(0)),
    stopDown = keyObservable('keyup','ArrowDown',()=>new Direction(0)),
  
    // Observable for resetting game 
    newGameObservable = <T>(e:Event, k:Key, result:()=>T)=>
      fromEvent<KeyboardEvent>(document,e)
          .pipe(
            filter(({code})=>code === k),
            filter(({repeat})=>!repeat),
            map(result)),
      newGame = newGameObservable("keydown", "KeyR", ()=>new NewGameTrigger())

  // DeclaBody type
  type Body = Readonly<{
    id:string,
    viewType: ViewType,
    pos:Vec, 
    vel:Vec,
    acc:Vec,
    scale: number,
    radius:number,
  }>

  // Declaring State type
  type State = Readonly<{
    paddle1: Body 
    paddle2: Body
    ball: Body
    score1:number,
    score2:number,
    exit: Body | null,
    gameOver: boolean
  }>

  const
    // Creates a new ball Body
    createBall = (oid?:number) => (angle:number) => {
      // Ensure that the ball does not start at a dead angle 
      function newAngle(angle:number) {
        console.log(angle)
        if ((angle>30&&angle<70)||(angle>110&&angle<150)||(angle>210&&angle<250)||(angle>290&&angle<330)) {
          return angle;
        }
        return newAngle(moreRng((angle/360) + 1).nextFloat()*360);
      }
      const startAngle = newAngle(angle);
      // Returns the ball Body
      return <Body> {
        id: 'ball' + String(oid),
        viewType: "ball",
        pos: new Vec(Constants.CanvasSize/2,Constants.CanvasSize/2),
        vel: Vec.unitVecInDirection(startAngle),
        acc: Vec.Zero,
        scale: 1,
        radius: Constants.StartBallRadius 
      }
    },

    // Generic function to create paddle bodies
    createPaddle = (padid: String, x: number, y: number) => {
      return <Body> {
        id: padid,
        viewType: "paddle",
        pos: new Vec(x, y),
        vel: Vec.Zero,
        acc: Vec.Zero,
        radius: 0
      }
    },

    // Random number generater when function is ran
    rng = new RNG(1),
    moreRng = (scores: number) => new RNG(scores),

    // Starting ball
    startBall = createBall(1)(rng.nextFloat()*360),

    // Initial state of the game
    initialState:State = {
      paddle1: createPaddle("paddle1", 20, 290),
      paddle2: createPaddle("paddle2", 570, 290),
      ball: startBall,
      score1: 0,
      score2: 0,
      exit: null,
      gameOver: false
    },

    // Moves a body automatically 
    moveObj = (o:Body) => <Body>{
      ...o,
      pos:o.pos.add(o.vel),
      vel:o.vel.add(o.acc)
    },

    // Calculate scale of speed for ball in cases where the ball hits the edge or the center 
    ballCalculations = (s: State, edge: boolean) => {
      if (!edge && s.ball.scale > 1){
        return{
          ...s.ball,
          vel: new Vec(s.ball.vel.x * -1, s.ball.vel.y).scale(0.75), scale: s.ball.scale -1
        }
      }
      else if (!edge && s.ball.scale == 1){
        return{
          ...s.ball,
          vel: new Vec(s.ball.vel.x * -1, s.ball.vel.y)
        }
      }
      else if (edge){
        return {
          ...s.ball,
          vel: new Vec(s.ball.vel.x * -1, s.ball.vel.y).scale(1.5), scale: s.ball.scale + 1
        }
      }

    },

    // Handles collisions between bodies and edges of the canvas 
    handleCollisions = (s:State) => {
      const
        // function to check if there is collision between the ball and the right wall
        rWallCollision = (s: State) => (s.ball.pos.x + s.ball.radius) >= 600 ,
        // function to check if there is collision between the ball and the left wall
        lWallCollision = (s: State) => (s.ball.pos.x - s.ball.radius) <= 0,
        // function to check if there is collision between the ball and the ceiling or floor
        ceilingCollision = (a: Body) => (a.pos.y - a.radius) <= 0 || (a.pos.y + a.radius) >= 600, 
        // function to check if there is collision between the ball and the Computer paddle
        paddle1Collision = (a: Body, b: Body) => (a.pos.x - a.radius) <= 30 && (a.pos.x - a.radius) >= 25 && (a.pos.y + a.radius) >= b.pos.y + 15 && (a.pos.y - a.radius) <= (b.pos.y + Constants.PaddleHeight - 15) && a.vel.x<0,
        // function to check if there is collision between the ball and the player paddle
        paddle2Collision = (a: Body, b: Body) => (a.pos.x + a.radius) >= 580 && (a.pos.x + a.radius) <= 585 && (a.pos.y + a.radius) >= b.pos.y + 15 && (a.pos.y - a.radius) <= (b.pos.y + Constants.PaddleHeight - 15) && a.vel.x>0,
        // function to check if there is collision between the edge of the paddle and the ball
        paddle1Edge = (a: Body, b: Body) => (a.pos.x - a.radius) <= 30 && (a.pos.x - a.radius) >= 25 && (((a.pos.y + a.radius) >= b.pos.y && (a.pos.y - a.radius) <= (b.pos.y + 15)) || ((a.pos.y + a.radius) >= b.pos.y + Constants.PaddleHeight - 15 && (a.pos.y - a.radius) <= (b.pos.y + Constants.PaddleHeight))) && a.vel.x<0,
        paddle2Edge = (a: Body, b: Body) => (a.pos.x + a.radius) >= 580 && (a.pos.x + a.radius) <= 585 && (((a.pos.y + a.radius) >= b.pos.y && (a.pos.y - a.radius) <= (b.pos.y + 15)) || ((a.pos.y + a.radius) >= b.pos.y + Constants.PaddleHeight - 15 && (a.pos.y - a.radius) <= (b.pos.y + Constants.PaddleHeight))) && a.vel.x>0

      if (rWallCollision(s)) {
        // If the ball collides with the right wall when the Computer score is more than or equal 6 will set the ball's position to the center point 
        // and stop it from moving after the next collision with a wall, increments player's score by 1, sets gameover to true
        if(s.score1 >= 6){
          return <State>{
            ...s,
            score1: s.score1+1,
            ball: {...s.ball, pos: new Vec(Constants.CanvasSize/2, Constants.CanvasSize/2), vel: Vec.Zero},
            gameOver: true
          }
        }
        // Else increments Computer's score by one and creates a new ball, places the old ball in exit to be removed
        else{
          return <State>{
            ...s,
            score1: s.score1+1,
            ball: createBall(1)(moreRng(s.score1+s.score2).nextFloat()*360),
            exit: s.ball,
          }
        }
      }
      else if (lWallCollision(s)) {
        // If the ball collides with the right wall when the Player score is more than or equal 6 will set the ball's position to the center point 
        // and stop it from moving after the next collision with a wall, increments player's score by 1, sets gameover to true
        if(s.score2 >= 6){
          return <State>{
            ...s,
            score2: s.score2+1,
            ball: {...s.ball, pos: new Vec(Constants.CanvasSize/2, Constants.CanvasSize/2), vel: Vec.Zero},
            gameOver: true
          }
        }
        // Else increments Player's score by one and creates a new ball, places the old ball in exit to be removed
        else{
          return <State>{
            ...s,
            score2: s.score2+1,
            ball: createBall(1)(moreRng(s.score1+s.score2).nextFloat()*360),
            exit: s.ball,
          }
        }
      }

      // If the ball hits the ceiling of the floor rebounds on the y-axis
      else if (ceilingCollision(s.ball)) {
        return <State>{
          ...s,
          ball: {...s.ball, vel: new Vec(s.ball.vel.x, s.ball.vel.y* -1)}
        }
      }

      // If the ball hits the paddles, rebound on the x-axis
      else if (paddle1Collision(s.ball, s.paddle1)) {
        console.log("hit")
        return <State>{
          ...s,
          ball: ballCalculations(s, false)
        }
      }
      else if (paddle1Edge(s.ball, s.paddle1)) {
        console.log("edge")
        return <State>{
          ...s,
          ball: ballCalculations(s, true)
        }
      }
      else if (paddle2Collision(s.ball, s.paddle2)) {
        console.log("hit")
        return <State>{
          ...s,
          ball: ballCalculations(s, false)
        }
      }
      else if (paddle2Edge(s.ball, s.paddle2)) {
        console.log("edge")
        return <State>{
          ...s,
          ball: ballCalculations(s, true)
        }
      }
      // If there is no collisions, return the original state passed in
      else {
        return <State>{
        ...s
        }
      }
    },

    // Function for the bahaviour of the AI paddle
    // Follows the velocity of the ball with slight delay if the paddle does not exceed bounds
    paddleAi = (s: State) => {
      if(s.ball.vel.y > 0 && (s.paddle1.pos.y + Constants.PaddleHeight <=600)){
        return{
          ...s.paddle1,
          vel: new Vec(0, s.ball.vel.y - 0.1)
        }
      }
      else if (s.ball.vel.y < 0 && (s.paddle1.pos.y >=0)){
        return{
          ...s.paddle1,
          vel: new Vec(0, s.ball.vel.y + 0.1)
        }
      }
      else {
        return{
          ...s.paddle1,
          vel: Vec.Zero
        }
      }
    },

    // Updates state with relevant operations 
    reduceState = (s: State, e: Direction | NewGameTrigger) =>{
      // If there are directional inputs, moves the player paddle, moves the other paddle and ball automatically
      if (e instanceof Direction && !(e.direction == 5 && (s.paddle2.pos.y + Constants.PaddleHeight)>=600) && !(e.direction == -5 && (s.paddle2.pos.y)<=0)) {
        return handleCollisions({...s,
          paddle1: moveObj(paddleAi(s)),
          paddle2: {...s.paddle2, pos: new Vec(s.paddle2.pos.x, s.paddle2.pos.y + e.direction)},
          ball: moveObj(s.ball)
        })
      }
      // if the inputs are for game reset and the game is over, returns the initial state
      else if (e instanceof NewGameTrigger && s.gameOver){
        return {...initialState}
      }
      // If there are directional inputs, moves the player paddle, moves the other paddle and ball automatically
      else {
        return handleCollisions({...s,
          paddle1: moveObj(paddleAi(s)),
          ball: moveObj(s.ball)
        })
      }
    },
  
    // The main loop of the game
    subscription = interval(10).pipe(
      merge(startUp, startDown, stopUp, stopDown),
      merge(newGame),
      scan(reduceState, initialState)
    ).subscribe(updateView);

  // Updates the UI that the player sees with each interval of subscribe 
  function updateView(s: State){
    const 
      // generic function to set attrbutes
      attr = (e:Element,o:Object) =>
        { for(const k in o) e.setAttribute(k,String(o[k])) },
      updateBallView = (b:Body) => {
        // creates the ball element
        const createBallView = ()=>{
          const v = document.createElementNS(svg.namespaceURI, "circle")!;
          attr(v,{id:b.id, r:b.radius, fill: Constants.White});
          v.classList.add(b.viewType)
          svg.appendChild(v)
          return v;
        }
        // if the ball is not in exit, moves the position of the ball 
        if (s.exit == null){
          const v = document.getElementById(b.id) || createBallView();
          attr(v,{cx:b.pos.x,cy:b.pos.y});
        }
        // if ball is in exit, removes the ball and updates the score accordingly, creates new ball and updates view
        else {
          svg.removeChild(document.getElementById(b.id))
          const s1 = document.getElementById("score1")
          const s2 = document.getElementById("score2")
          s1.textContent = String(s.score1)
          s2.textContent = String(s.score2)
          const v = createBallView()
          attr(v,{cx:b.pos.x,cy:b.pos.y})

        }
      },
      // update the view for paddles
      updatePaddleView = (b:Body) => {
        const createPaddleView = ()=>{
          const v = document.createElementNS(svg.namespaceURI, "rect")!;
          attr(v,{id:b.id, height:Constants.PaddleHeight, width:Constants.PaddleWidth, fill: Constants.White});
          v.classList.add(b.viewType)
          svg.appendChild(v)
          return v;
        }
        const v = document.getElementById(b.id) || createPaddleView();
        attr(v,{x:b.pos.x, y:b.pos.y});
      };
    updateBallView(s.ball)
    updatePaddleView(s.paddle1)
    updatePaddleView(s.paddle2)

    // removes winning text when the game resets and resets scores
    if((s.score1 != 7 || s.score2 !=7)&& document.getElementById("wintext") != null){
      svg.removeChild(document.getElementById("wintext"))
      const s1 = document.getElementById("score1")
      const s2 = document.getElementById("score2")
      s1.textContent = String(s.score1)
      s2.textContent = String(s.score2)
    }

    // shows "Computer Wins!" when the computer wins
    if(s.score1 === 7) {
      const v = document.createElementNS(svg.namespaceURI, "text")!;
      attr(v,{id: "wintext", x:Constants.CanvasSize/4,y:Constants.CanvasSize/2, style : "font-size: 40 ; fill: red", class:"gameover"});
      v.textContent = "Computer Wins !";
      svg.appendChild(v);
    }

    // shows "Player Wins!" when the player wins
    if(s.score2 === 7) {
      const v = document.createElementNS(svg.namespaceURI, "text")!;
      attr(v,{id: "wintext", x:Constants.CanvasSize/4,y:Constants.CanvasSize/2, style : "font-size: 40 ; fill: red", class:"gameover"});
      v.textContent = "Player Wins !";
      svg.appendChild(v);
    }
  }
}   

// the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != 'undefined')
  window.onload = ()=>{
    pong();
  }

// Class for math vector operations
class Vec {
  constructor(public readonly x: number = 0, public readonly y: number = 0) {}
  add = (b:Vec) => new Vec(this.x + b.x, this.y + b.y)
  sub = (b:Vec) => this.add(b.scale(-1))
  len = ()=> Math.sqrt(this.x*this.x + this.y*this.y)
  scale = (s:number) => new Vec(this.x*s,this.y*s)
  ortho = ()=> new Vec(this.y,-this.x)
  rotate = (deg:number) =>
            (rad =>(
                (cos,sin,{x,y})=>new Vec(x*cos - y*sin, x*sin + y*cos)
              )(Math.cos(rad), Math.sin(rad), this)
            )(Math.PI * deg / 180)

  static unitVecInDirection = (deg: number) => new Vec(0,-1).rotate(deg)
  static Zero = new Vec();
}

class RNG {
  // LCG using GCC's constants
  m = 0x80000000// 2**31
  a = 1103515245
  c = 12345
  state:number
  constructor(seed: number) {
    this.state = seed ? seed : Math.floor(Math.random() * (this.m - 1));
  }
  nextInt() {
    this.state = (this.a * this.state + this.c) % this.m;
    return this.state;
  }
  nextFloat() {
    // returns in range [0,1]
    return this.nextInt() / (this.m - 1);
  }
}