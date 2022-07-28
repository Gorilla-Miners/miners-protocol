const { formatUnits, parseEther } = require("ethers/lib/utils");
const { artifacts, contract } = require("hardhat");
const { assert, use } = require("chai");
const { constants, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");

const MockERC20 = artifacts.require("./MockERC20.sol");
const MinerProtocol = artifacts.require("./MinerProtocol.sol");

use(require("chai-as-promised"))
  .should()

contract("MinerProtocol", ([dev, bob, carol, david, erin]) => {
  let minerProtocol;
  let busd;
  let minerInitialBal = 200000000;

  beforeEach(async () => {
    // Deploy BUSD
    busd = await MockERC20.new("Binance USD", "BUSD", parseEther("100000000000000000"), { from: dev });

    // Deploy MinerProtocol
    minerProtocol = await MinerProtocol.new(busd.address, { from: dev });

    // Mint and approve all contracts
    for (let thisUser of [dev, bob, carol, david, erin]) {
      await busd.mintTokens(parseEther("200000000"), { from: thisUser });

      await busd.approve(minerProtocol.address, constants.MAX_UINT256, {
        from: thisUser,
      });
    }
    await busd.transfer(minerProtocol.address, parseEther("200000000"), { from: erin });
  });

  describe("Normal cases for investment", async () => {
    it("User stakes busd", async function () {
      const stakingAmount = '700';
      const investmentFee = "5";
      const referralFee = ((stakingAmount - investmentFee) * 10) / 100;
      const adminAddress = await minerProtocol.adminAddress();

      await minerProtocol.recordReferral(bob, carol, { from: bob });
      let result = await minerProtocol.getReferrer(bob, { from: bob });
      assert.equal(result.referrer, carol);

      result = await minerProtocol.invest(
        parseEther(stakingAmount), { from: bob }
      );

      assert.equal(String(await busd.balanceOf(minerProtocol.address)), parseEther((minerInitialBal + (stakingAmount - investmentFee) - referralFee).toString()).toString());
      assert.equal(String(await busd.balanceOf(adminAddress)), parseEther(investmentFee).toString());

      await time.increase(86400);

      result = await minerProtocol.getUserDetails(bob);
      const monthlyReturn = 3*30;
      const amt = ((((stakingAmount - investmentFee) * monthlyReturn) / 100) * 86400) / 2592000
      assert.equal(String(result[1]), parseEther((amt).toString()).toString());

      await expectRevert(minerProtocol.invest(
        parseEther("14"), { from: bob }
      ),
        'Minimum compounding is 10 busd',
      );

      await minerProtocol.invest(
        parseEther(stakingAmount), { from: bob }
      );

      // ensure carol does not get commission on every investment
      const initialBalance = 200000000;
      const carolsBalance = initialBalance + referralFee;
      assert.equal(String(await busd.balanceOf(carol)), parseEther(carolsBalance.toString()).toString());
    });
  });

  describe("Withdrawal cases", async () => {
    it("User withdraws investments", async function () {
      const stakingAmount = '700';

      await minerProtocol.invest(
        parseEther(stakingAmount), { from: bob }
      );

      await time.increase(86400);

      await minerProtocol.withdraw({ from: bob });
      let userDetails = await minerProtocol.getUserDetails(bob);
      assert.equal(userDetails[0].totalWithdrawal, 357925120659722222222)

      await minerProtocol.invest(
        parseEther(stakingAmount), { from: bob }
      );

      await time.increase(7776000);

      const oldUserDetails = await minerProtocol.getUserDetails(bob);
      const oldTotalBalance = Number(formatUnits(oldUserDetails[0].amount)) + Number(formatUnits(String(oldUserDetails[1])));

      await minerProtocol.withdraw({ from: bob });
      userDetails = await minerProtocol.getUserDetails(bob);
      // checking for the locked 30 percent
      assert.equal((oldTotalBalance * 30) / 100, formatUnits(userDetails[0].debt))

      const oldDebt = userDetails[0].debt;

      await expectRevert(minerProtocol.invest(
        parseEther('167.03166666666667'), { from: bob }
      ),
        'Invest at least 50% of your previous earning',
      );
      result = await minerProtocol.invest(
        parseEther('555.5475'), { from: bob }
      )

      expectEvent.inTransaction(result.receipt.transactionHash, busd, "Transfer", {
        from: minerProtocol.address,
        to: bob,
        value: oldDebt,
      });
    });
  });

  describe("Referral and leadership programs", async () => {
    it("User referrals", async function () {
      const stakingAmount = '700';
      const carrolStaking = '20000';

      await minerProtocol.invest(
        parseEther(stakingAmount), { from: bob }
      );

      await time.increase(86400);

      await minerProtocol.recordReferral(carol, bob, { from: bob });
      let result = await minerProtocol.getReferrer(carol, { from: bob });
      assert.equal(result.referrer, bob);


      await minerProtocol.invest(
        parseEther(carrolStaking), { from: carol }
      );

      await time.increase(86400);

      result = await minerProtocol.getReferralRewards(bob);
      let carolDetails = await minerProtocol.getUserDetails(carol);

      let bobDetails = await minerProtocol.getUserDetails(bob);

      await minerProtocol.withdraw({ from: bob });
      res = await minerProtocol.getReferralRewards(bob);
      let newBobBalance = await busd.balanceOf(bob);

      let totalBalance = Number(bobDetails[1].toString()) + Number(bobDetails[0].amount.toString()) + Number(result.toString());
      let paymentReceived = (totalBalance / 2);
      paymentReceived = paymentReceived - (paymentReceived * 2.5) / 100

      assert.equal(2.0000129950062534e+26.toString(), (Number(String(newBobBalance)) - paymentReceived).toString())
    });
  });
});
