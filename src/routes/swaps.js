const express = require('express'),
    router = express.Router();
const uuid = require('uuid');
const idena = require('../idena');
const { Rweb3 } = require('rweb3');
const db = require('../models');
    const { Sequelize, Transaction, Op } = require('sequelize');
const bsc = require('../bsc');
const {
    utils
} = require('ethers');
const {
    ethers
} = require('ethers');
const logger = require('../logger').child({
    component: "api"
})
const rweb3 = new Rweb3('http://runebaseinfo:runebaseinfo@localhost:9432');


router.get('/latest', async function (req, res) {
    try {
        console.log('latest');
        await latest(req, res)
    } catch (error) {
        logger.error(`Failed ${req.path}: ${error}`)
        res.sendStatus(500)
    }
});

async function latest(req, res) {
    const reqInfo = req.path
    logger.debug(`Got ${reqInfo}`);
    const result = await db.swaps.findAll({
        where: {
          userId: req.user.id,
        },
        limit: 50,
        order: [['time', 'DESC']],
        attributes: [
            'address',
            'depositAddress',
            'type',
            'amount',
            'status',
            'time',
        ],
      });
    if (result.length) {
        logger.debug(`Completed ${reqInfo}`)
        res.status(200).json({
            result,
        });
        return;
    }
    res.sendStatus(500);
    return;
}

router.get('/info/:uuid', async function (req, res) {
    try {
        await info(req, res)
    } catch (error) {
        logger.error(`Failed ${req.path}: ${error}`)
        res.sendStatus(500)
    }
});

async function info(req, res) {
    const reqInfo = req.path
    logger.debug(`Got ${reqInfo}`)
    if (!uuid.validate(req.params.uuid)) {
        logger.debug(`Bad request ${reqInfo}`)
        res.sendStatus(400);
        return
    }
    const result = await db.swaps.findOne({
        where: {
            uuid: req.params.uuid,
        }
    })
    if (!result) {
        logger.debug(`Not found ${reqInfo}`)
        res.sendStatus(404);
                return;
    }
    if (result) {
        logger.debug(`Completed ${reqInfo}`)
        res.status(200).json({
            result
        })
    }
}

router.post('/assign', async function (req, res) {
    console.log('route /assign');
    try {
        await assign(req, res)
    } catch (error) {
        logger.error(`Failed ${req.path} (uuid=${req.body.uuid}): ${error}`)
        res.sendStatus(500)
    }
});

async function assign(req, res) {
    console.log('start assign function');
    const reqInfo = `${req.path} (uuid=${req.body.uuid}, tx=${req.body.tx})`
    logger.debug(`Got ${reqInfo}`)
    if (!uuid.validate(req.body.uuid)) {
        console.log('uid not valid');
        logger.debug(`Bad request ${reqInfo}`)
        res.sendStatus(400);
        return
    }

    function reject(err) {
        console.log('rejected');
        logger.error(`Failed ${reqInfo}: ${err}`)
        res.sendStatus(500);
    }

    let conP = db.promise();
    let sql = "SELECT `uuid`,`amount`,`address`,`type`,`idena_tx`,`bsc_tx`, `time` FROM `swaps` WHERE `uuid` = ? LIMIT 1;";
    let data
    try {
        [data] = await conP.execute(sql, [req.body.uuid]);
    } catch (err) {
        reject(err)
        return
    }
    console.log('inter');

    if (data[0] && data[0].type === 0 && !(data[0].idena_tx) && req.body.tx.length === 64) {
        console.log('if data');
        if (await idena.isTxExist(req.body.tx)) {
            if (await idena.isValidSendTx(req.body.tx, data[0].address, data[0].amount, data[0].time) && await idena.isNewTx(req.body.tx)) {
                sql = "UPDATE `swaps` SET `idena_tx` = ? WHERE `uuid` = ? ;";
                conP.execute(sql, [req.body.tx, req.body.uuid]).then(() => {
                    logger.debug(`Completed ${reqInfo}`)
                    res.sendStatus(200);
                }).catch(reject)
                return
            }
            logger.debug(`Bad request ${reqInfo}`)
            res.sendStatus(400);
            return
        }

        sql = "UPDATE `swaps` SET `idena_tx` = ? WHERE `uuid` = ?;";
        conP.query(sql, [req.body.tx, req.body.uuid]).then(() => {
            logger.debug(`Completed ${reqInfo}`)
            res.sendStatus(200);
        }).catch(reject)
        return
    }
    if (data[0] && data[0].type === 1 && !(data[0].bsc_tx) && ethers.utils.isHexString(req.body.tx) && req.body.tx.length === 66) {
        if (await bsc.isTxExist(req.body.tx)) {
            if (await bsc.isValidBurnTx(req.body.tx, data[0].address, data[0].amount, data[0].time) && await bsc.isNewTx(req.body.tx)) {
                sql = "UPDATE `swaps` SET `bsc_tx` = ? WHERE `uuid` = ?;";
                conP.query(sql, [req.body.tx, req.body.uuid]).then(() => {
                    logger.debug(`Completed ${reqInfo}`)
                    res.sendStatus(200);
                }).catch(reject)
                return
            }
            logger.debug(`Bad request ${reqInfo}`)
            res.sendStatus(400);
            return
        }
        sql = "UPDATE `swaps` SET `bsc_tx` = ? WHERE `uuid` = ?;";
        conP.query(sql, [req.body.tx, req.body.uuid]).then(() => {
            logger.debug(`Completed ${reqInfo}`)
            res.sendStatus(200);
        }).catch(reject)
        return
    }
    logger.debug(`Bad request ${reqInfo}`)
    res.sendStatus(400);
}

router.post('/create', async function (req, res) {
    try {
        console.log('create');
        await create(req, res)
    } catch (error) {
        logger.error(`Failed ${req.path} (type=${req.body.type}, amount=${req.body.amount}, address=${req.body.address}): ${error}`)
        res.sendStatus(500)
    }
});

async function isConnected() {
    return await rweb3.isConnected();
  }
  async function isRunebaseAddress(address) {
    return await rweb3.utils.isRunebaseAddress(address);
  }
  async function getNewAddress() {
    return await rweb3.getNewAddress();
  }

async function create(req, res) {
    const isItConnected = await isConnected();
    if(!isItConnected) {
        logger.debug(`Unable to connect to Runebase Node`)
        res.sendStatus(400);
        return;
    }
    const reqInfo = `${req.path} (type=${req.body.type}, amount=${req.body.amount}, address=${req.body.address})`;
    console.log(reqInfo);
    logger.debug(`Got ${reqInfo}`);
    console.log('type:');
    let type = parseInt(req.body.type);
    console.log(type);
    let amount = parseFloat(req.body.amount);
    let RunebaseAddress;
    
    if (type === 0) {
        RunebaseAddress = await getNewAddress();
        console.log(RunebaseAddress);
    }

    if (type === 0 && !RunebaseAddress) {
        console.log(`Unable to generate Runebase Address ${reqInfo}`);
        logger.debug(`Unable to generate Runebase Address  ${reqInfo}`);
        res.sendStatus(400);
        return;
    }

    if (!isRunebaseAddress(req.body.address) && type === 0) {
        console.log(`Invalid Runebase Address ${reqInfo}`);
        logger.debug(`Invalid Runebase Address ${reqInfo}`);
        res.sendStatus(400);
        return;
    }

    if (!utils.isAddress(req.body.address) && type === 1) {
        console.log(`Invalid BSC Address ${reqInfo}`);
        logger.debug(`Invalid BSC Address ${reqInfo}`);
        res.sendStatus(400);
        return;
    }

    if ((type !== 0 && type !== 1) || !(amount >= process.env.MIN_SWAP)) {
        console.log('bad request');
        logger.debug(`Bad request ${reqInfo}`)
        res.sendStatus(400);
        return
    }
    console.log('insert swap');
    let newUUID = uuid.v4();
    await db.sequelize.transaction({
        isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE,
      }, async (t) => {
        const activity = await db.swaps.create({
            uuid: newUUID,
            amount: amount.toFixed(8),
            address: req.body.address,
            depositAddress: type === 0 && RunebaseAddress ? RunebaseAddress : null,
            type,
          }, {
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
        t.afterCommit(() => {
            logger.debug(`Completed ${reqInfo}: ${newUUID}`)
            res.status(200).json({
                result: {
                    "uuid": newUUID,
                }
            });
        });
      }).catch((err) => {
        console.log(`Failed to handle request '/create': ${err.message}`)
        logger.error(`Failed to handle request '/create': ${err.message}`)
        res.sendStatus(500);
        return;
      });
}

router.get('/calculateFees/:uuid', async function (req, res) {
    try {
        await calculateFees(req, res)
    } catch (error) {
        logger.error(`Failed ${req.path}: ${error}`)
        res.sendStatus(500)
    }
});

async function calculateFees(req, res) {
    const reqInfo = req.path
    logger.debug(`Got ${reqInfo}`)
    if (!uuid.validate(req.params.uuid)) {
        logger.debug(`Bad request ${reqInfo}`)
        res.sendStatus(400);
        return
    }
    let sql = "SELECT address, amount FROM `swaps` WHERE `uuid` = ? LIMIT 1;";
    db.promise().execute(sql, [req.params.uuid])
        .then(async ([data, fields]) => {
            if (!data[0]) {
                logger.debug(`Not found ${reqInfo}`)
                res.sendStatus(404);
                return
            }
            logger.debug(`Completed ${reqInfo}`)

            res.status(200).json({
                result: await bsc.calculateFees(data[0].address, data[0].amount)
            })
        })
        .catch(err => {
            logger.error(`Failed ${reqInfo}: ${err}`)
            res.sendStatus(500);
        });
}

module.exports = router;