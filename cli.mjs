import { io } from 'socket.io-client';
const serverUrl = 'http://localhost:5858'
const usersNamespace = '/users';
const chatNamespace = '/messages';
//const socket = io('http://localhost:5858/users');
import util from 'util';

import boxen from 'boxen';
import chalk from 'chalk';

import readline from 'readline';

let currentMenuLevel = 1;
let currentProcess = undefined;
let userSocket = undefined;
let chatSocket = undefined;
let loginUsername = undefined;
let chatWith = undefined;
let convKey = undefined;
const menus = {
    1: {
        "1": "Login",
        "2": "Register",
        "3": "Exit"
    },
    2: {
        "m": "direct message",
        "q": "quit"
    },
    3: {
        "GoBackToMainMenu": "GoBackToMainMenu"
    }
}

const processes = {
    "Register" : {
        param1: "Username",
        param2: "Password"
    },
    "Login" : {
        param1: "Username",
        param2: "Password"
    },
    "Chat" : {
        param1: "Username"
    }
}

function getBanner() {
    let text = "***********************************************\n";
    text +=    "            Welcome to Flashchat               \n";
    text +=    "***********************************************\n";
    return text;
}

function printMenu(level) {
    let text = "";
    const menuObj = menus[level];
    if (level == 1) {
        text = getBanner();
    }
    
    for (const att in menuObj) {
        text += att + ") " + menuObj[att] + "    ";
    }
    console.log(boxen(chalk.blue(text),{padding: 1, margin: 1}));
}


const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> "
});


printMenu(currentMenuLevel);


async function catchProcessDeath() {
    console.log('urk....');
    await logOutUser();
    process.exit(0);
}

process.on('SIGTERM', catchProcessDeath);
process.on('SIGINT', catchProcessDeath);
process.on('SIGHUP', catchProcessDeath);

async function logOutUser() {
    if (loginUsername && userSocket) {
        
        await new Promise ((resolve, reject) => {
            userSocket.emit('logout', {
                username: loginUsername
            }, res => {
                resolve(res);
                console.log(`${loginUsername} logged out.`);
                loginUsername = undefined;
            });
        });
    }
}

rl.prompt();

rl.on('line', (line) => {
    processCmd(line);
}).on('close', async () => {
    await logOutUser();
    console.log("Bye");
    process.exit(0);
});

function printLoginRegisterInstruction(login) {
    const text = login ? " to login" : " to register";
    console.log(chalk.green("Enter <Username> <Password> " + text));
}

function printDirectMessageInstruction() {
    console.log(chalk.green("Enter <Username> to chat with"));
}

async function processCmd(line) {
    const command = line.split('\n')[0];
    if (currentProcess === undefined) {
        if (!menus[currentMenuLevel][command]) {
            console.log(chalk.red('Invalid selection'));
        } else {
            currentProcess = menus[currentMenuLevel][command];
            if (currentProcess === "Exit") {
                process.exit(0);
            }
            if (currentProcess === "Register") {
                printLoginRegisterInstruction(false);
            } else if (currentProcess == "Login") {
                printLoginRegisterInstruction(true);
            } else if (currentProcess == "quit") {
                process.exit(0);
            } else if (currentProcess == "direct message") {
                printDirectMessageInstruction();
            } 
            //print next step instruction
        }
    } else if (currentProcess === "Register") {
        const params = command.split(' ');
        if (params.length === 2) {
            //process register
            doRegister(params[0], params[1]);
        } else {
            console.log("Invalid command. For registration, please input <username> <password>");
        }
    } else if (currentProcess === "Login") {
        const params = command.split(' ');
        if (params.length === 2) {
            //process register
            doLogin(params[0], params[1]);
        } else {
            console.log("Invalid command. For login, please input <username> <password>");
        }
    } else if (currentProcess === "direct message") {
        const params = command.split(' ');
        const withUser = params[0];
        doChat(withUser);
    } else if (currentProcess == "chatting") {
        if (command === "GoBackToMainMenu") {
            //back to main menu
            await logOutUser();
            chatWith = undefined;
            userSocket = undefined;
            chatSocket = undefined;
            currentMenuLevel = 1;
            currentProcess = undefined;
            printMenu(currentMenuLevel);
        } else {
            chatting(command);
        }
        
    }
    
}

function printOnlineUser(online) {
    console.log(chalk.green('Online user'));
    for (const user of online) {
        console.log(chalk.green(user.username));
    }
    console.log("");
}

function printOfflineUser(offline) {
    console.log(chalk.red('Offline users:'));
    for (const user of offline) {
        console.log(chalk.red(user.username));
    }
    console.log("");
}

function printUserList(online, offline) {
    printOfflineUser(offline);
    printOnlineUser(online);
    printMenu(currentMenuLevel);
}

function printMessage(msg) {
    const from = msg.from === loginUsername ? msg.from : chalk.yellow(msg.from);
    const message = msg.from === loginUsername ? msg.message : chalk.green(msg.message);
    console.log(`${from}: ${message}`);
}

function registerUserListEvent() {
    userSocket.on('userslist', data => {
        printUserList(data.online, data.offline);
    });
}

function deregisterUserListEvent() {
    userSocket.removeListener('userslist');
}

async function doRegister(username, password) {
    userSocket = io(serverUrl + usersNamespace);
    userSocket.emit('create-user', {
        username: username,
        password: password
    }, res => {
        if (res.success) {
            // logged in, move to level 2 menu
            currentMenuLevel = 2
            currentProcess = undefined;
            loginUsername = username;
            // register listener for 'userlist' event
            registerUserListEvent();
        }
    });
}

async function doLogin(username, password) {
    userSocket = io(serverUrl + usersNamespace);
    userSocket.emit('login', {
        username: username,
        password: password
    }, res => {
        if (res.success) {
            // logged in, move to level 2 menu
            currentMenuLevel = 2;
            currentProcess = undefined;
            loginUsername = username;
            // register listener for 'userlist' event
            registerUserListEvent();
        }
    });
}

async function doChat(withUser) {
    //deregister userlist event, so it won't interupt the chat log
    deregisterUserListEvent();
    //prepare all the params
    currentProcess = "chatting";
    chatWith = withUser;
    console.log(chalk.red('Chat started. Enter "GoBackToMainMenu" to go back to main menu'));

    chatSocket = io(serverUrl + chatNamespace);

    //register listener
    chatSocket.on('newmessage', (data) => {
        //show message if it is from the other person
        
        if (data.from !== loginUsername) {
            printMessage(data);
        }
    });

    chatSocket.emit('getKey', { p1: loginUsername, p2: withUser}, res => {
        convKey = res;
        chatSocket.emit('recentmessages', {key: convKey}, res => {
            for (const msg of res) {
                printMessage(msg);
            }
        });
    });
}

async function chatting(message) {
    chatSocket.emit("create-message", {
        key: convKey,
        from: loginUsername,
        message: message
    }, res => {
        
    })
}





