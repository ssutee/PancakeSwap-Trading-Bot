import ethers from "ethers";
import express from "express";
import chalk from "chalk";
import dotenv from "dotenv";
import inquirer from "inquirer";

const app = express();
dotenv.config();

const data = {
  tokenIn: process.env.TO_SPEND, //wbnb

  tokenOut: process.env.TO_PURCHASE, // token that you will purchase = BUSD for test '0xe9e7cea3dedca5984780bafc599bd69add087d56'

  amountIn: process.env.AMOUNT_IN, // how much you want to buy in WBNB

  factory: process.env.FACTORY, //PancakeSwap V2 factory

  router: process.env.ROUTER, //PancakeSwap V2 router

  recipient: process.env.YOUR_ADDRESS, //your wallet address,

  slippage: process.env.SLIPPAGE, //in Percentage

  gasPrice: ethers.utils.parseUnits(`${process.env.GWEI}`, "gwei"), //in gwei

  gasLimit: process.env.GAS_LIMIT, //at least 21000

  minBnb: process.env.MIN_LIQUIDITY_ADDED, //min liquidity added
};

let initialLiquidityDetected = false;
let jmlIn = 0;

const bscMainnetUrl = process.env.HTTP_RPC;
const wss = process.env.WSS_RPC;
const pk = process.env.YOUR_PRIVATE_KEY; //your private key;
const tokenIn = data.tokenIn;
const tokenOut = data.tokenOut;
// const provider = new ethers.providers.JsonRpcProvider(bscMainnetUrl)
const provider = new ethers.providers.WebSocketProvider(wss);

const account = new ethers.Wallet(pk, provider);

const factory = new ethers.Contract(
  data.factory,
  [
    "event PairCreated(address indexed token0, address indexed token1, address pair, uint)",
    "function getPair(address tokenA, address tokenB) external view returns (address pair)",
  ],
  account
);

const router = new ethers.Contract(
  data.router,
  [
    "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
    "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  ],
  account
);

const erc = new ethers.Contract(
  data.tokenIn,
  [
    {
      constant: true,
      inputs: [{ name: "_owner", type: "address" }],
      name: "balanceOf",
      outputs: [{ name: "balance", type: "uint256" }],
      payable: false,
      type: "function",
    },
    "function symbol() external view returns (string memory)",
  ],
  account
);

const run = async () => {
  //await checkLiq(); // para snipping bot
  await buyAction();
};

let checkLiq = async () => {
  const pairAddressx = await factory.getPair(tokenIn, tokenOut);
  console.log(chalk.blue(`pairAddress: ${pairAddressx}`));
  if (pairAddressx !== null && pairAddressx !== undefined) {
    // console.log("pairAddress.toString().indexOf('0x0000000000000')", pairAddress.toString().indexOf('0x0000000000000'));
    if (pairAddressx.toString().indexOf("0x0000000000000") > -1) {
      console.log(
        chalk.cyan(`pairAddress ${pairAddressx} not detected. Auto restart`)
      );
      return await run();
    }
  }
  const symbol = await erc.symbol();
  const pairInValue = await erc.balanceOf(pairAddressx);
  jmlIn = await ethers.utils.formatEther(pairInValue);
  console.log(`value ${symbol} : ${jmlIn}`);

  if (jmlIn > data.minBnb) {
    setTimeout(() => buyAction(), 3000);
  } else {
    initialLiquidityDetected = false;
    console.log(" run again...");
    return await run();
  }
};

let buyAction = async () => {
  if (initialLiquidityDetected === true) {
    console.log("not buy cause already buy");
    return null;
  }

  console.log("ready to buy");
  try {
    initialLiquidityDetected = true;

    let amountOutMin = 0;
    //We buy x amount of the new token for our wbnb
    const amountIn = ethers.utils.parseUnits(`${data.amountIn}`, "ether");
    // if ( parseInt(data.Slippage) !== 0 ){
    //   const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
    //   //Our execution price will be a bit different, we need some flexbility
    //   const amountOutMin = amounts[1].sub(amounts[1].div(`${data.Slippage}`));
    // }
    const symbol = await erc.symbol();

    console.log(
      chalk.green.inverse(`Start to buy \n`) +
        `Buying Token
        =================
        tokenIn: ${(amountIn * 1e-18).toString()} ${tokenIn} (${symbol})
        tokenOut: ${amountOutMin.toString()} ${tokenOut}
      `
    );

    console.log("Processing Transaction.....");
    console.log(
      chalk.yellow(`amountIn: ${amountIn * 1e-18} ${tokenIn} (${symbol})`)
    );
    console.log(chalk.yellow(`amountOutMin: ${amountOutMin}`));
    console.log(chalk.yellow(`tokenIn: ${tokenIn}`));
    console.log(chalk.yellow(`tokenOut: ${tokenOut}`));
    console.log(chalk.yellow(`data.recipient: ${data.recipient}`));
    console.log(chalk.yellow(`data.gasLimit: ${data.gasLimit}`));
    console.log(chalk.yellow(`data.gasPrice: ${data.gasPrice}`));

    const tx =
      await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        //uncomment this if you want to buy deflationary token
        // const tx = await router.swapExactTokensForTokens( //uncomment here if you want to buy token
        amountIn,
        amountOutMin,
        [tokenIn, tokenOut],
        data.recipient,
        Date.now() + 1000 * 60 * 5, //5 minutes
        {
          gasLimit: data.gasLimit,
          gasPrice: data.gasPrice,
          nonce: null, //set you want buy at where position in blocks
        }
      );

    const receipt = await tx.wait();
    console.log(
      `Transaction receipt : https://www.bscscan.com/tx/${receipt.logs[1].transactionHash}`
    );
    setTimeout(() => {
      process.exit();
    }, 2000);
  } catch (err) {
    let error = JSON.parse(JSON.stringify(err));
    console.log(`Error caused by : 
        {
        reason : ${error.reason},
        transactionHash : ${error.transactionHash}
        message : Please check your ${symbol} balance, maybe its due because insufficient balance or approve your token manually on pancakeSwap
        }`);
    console.log(error);

    inquirer
      .prompt([
        {
          type: "confirm",
          name: "runAgain",
          message: "Do you want to run this bot again?",
        },
      ])
      .then((answers) => {
        if (answers.runAgain === true) {
          console.log(
            "= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = ="
          );
          console.log("Run again");
          console.log(
            "= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = ="
          );
          initialLiquidityDetected = false;
          run();
        } else {
          process.exit();
        }
      });
  }
};

run();

const PORT = 5000;

app.listen(
  PORT,
  console.log(
    chalk.yellow(`Listening for Liquidity Addition to token ${data.tokenOut}`)
  )
);
