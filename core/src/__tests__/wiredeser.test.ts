import { MultiDeSer } from '@darlean/utils';
import { ITransportFailure } from '../infra';
import { IActorCallRequest, IActorCallResponse } from '@darlean/base';
import { deserialize, serialize } from '../infra/wiredeser';
import { ITracingTags, IRemoteCallTags, ITransportTags } from '../infra/wiretypes';

describe('Wire DeSer', () => {
    test('Basic', () => {
        const deser = new MultiDeSer();
        const msg: ITracingTags & ITransportTags & IRemoteCallTags & IActorCallRequest & IActorCallResponse & ITransportFailure =
            {
                remotecall_id: '123',
                actionName: 'an',
                actorId: ['a', 'b', ''],
                actorType: 'at',
                lazy: true,
                arguments: [1, true, false, 'Hello'],
                remotecall_kind: 'call',
                code: '123',
                message: 'msg',
                transport_receiver: 'rec',
                error: {
                    code: 'code',
                    kind: 'application',
                    message: 'msg'
                },
                result: 'Hello',
                transport_return: 'ret',
                tracing_cids: ['aaaaa', 'bbbbbb'],
                tracing_parentUid: '998877'
            };
        const ser = serialize(msg, deser);
        const result = deserialize(ser, deser);
        expect(result).toStrictEqual(msg);
    });

    test('BuffersInArgs', () => {
        const deser = new MultiDeSer();
        const msg: ITracingTags & ITransportTags & IRemoteCallTags & IActorCallRequest = {
            transport_receiver: 'rec',
            remotecall_id: '123',
            remotecall_kind: 'call',
            actorType: 'at',
            actorId: [],
            actionName: 'action',
            arguments: [Buffer.from('Foo'), { foo: Buffer.from('Bar') }]
        };
        const ser = serialize(msg, deser);
        const result = deserialize(ser, deser) as IActorCallRequest;
        expect((result.arguments[0] as Buffer).toString()).toBe('Foo');
        expect((result.arguments[1] as { foo: Buffer }).foo.toString()).toBe('Bar');
    });

    test('BuffersInResponse-Raw', () => {
        const deser = new MultiDeSer();
        const msg: ITracingTags & ITransportTags & IRemoteCallTags & IActorCallResponse = {
            transport_receiver: 'rec',
            remotecall_id: '123',
            remotecall_kind: 'return',
            result: Buffer.from('Foo')
        };
        const ser = serialize(msg, deser);
        const result = deserialize(ser, deser) as IActorCallResponse;
        expect((result.result as Buffer).toString()).toBe('Foo');
    });

    test('BuffersInResponse-InJson', () => {
        const deser = new MultiDeSer();
        const msg: ITracingTags & ITransportTags & IRemoteCallTags & IActorCallResponse = {
            transport_receiver: 'rec',
            remotecall_id: '123',
            remotecall_kind: 'return',
            result: { foo: Buffer.from('Foo') }
        };
        const ser = serialize(msg, deser);
        const result = deserialize(ser, deser) as IActorCallResponse;
        expect((result.result as { foo: Buffer }).foo.toString()).toBe('Foo');
    });
});
