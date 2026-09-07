import pytest
from strength import strength

@pytest.mark.parametrize('actual,to,rate,rating', [
    (1193,1481,80.55,'R2'), (85,100,85,'R1'), (8499,10000,84.99,'R2'),
    (745,1000,74.5,'R2'), (7449,10000,74.49,'R3'), (5051,10000,50.51,'R3'),
    (505,1000,50.5,'R4'), (50505,100000,50.50,'Review'),
    (0,100,0,'R4'), (125,100,125,'R1'), (10,0,None,None), (10,None,None,None),
])
def test_fill_and_band(actual,to,rate,rating):
    result = strength(actual,to)
    assert result['fill_rate'] == rate
    assert result['rating'] == rating

from test_workflow import client
import main
from psycopg.types.json import Jsonb


def test_unit_publication_recomputes_c1_staffing(client):
    with main.connect() as c:
        c.execute("INSERT INTO units(id,name,reporting) VALUES('AETC','C1',false)")
        c.execute("INSERT INTO units(id,name,parent_id) VALUES('AETC--PAFFS','PAFFS','AETC')")
        c.execute("UPDATE personnel SET unit_id='AETC--PAFFS' WHERE id in ('p0','p1','p2')")
    assert client.post('/session',json={'workspace':'AETC--PAFFS'}).status_code == 200
    day='2026-09-01'
    entries=[{'id':f'p{i}','status':'available' if i<2 else 'leave'} for i in range(3)]
    payload={'day':day,'expected_revision':0,'publish':False,'reason':'Synthetic verification','entries':entries}
    assert client.post('/units/AETC--PAFFS/return',json=payload).status_code == 200
    client.post('/session/logout')
    assert client.get('/session').status_code == 401
    client.post('/session',json={'workspace':'AETC'})
    data=client.get('/dashboard',params={'day':day,'root':'AETC'}).json()
    assert data['staffing']['actual']==3
    assert data['staffing']['authorized']==1481
    assert data['metrics']['assigned']==0
    assert client.post('/units/AETC--PAFFS/return',json=payload).status_code==403
    client.post('/session',json={'workspace':'AETC--PAFFS'})
    payload.update(expected_revision=1,publish=True)
    assert client.post('/units/AETC--PAFFS/return',json=payload).status_code==200
    client.post('/session',json={'workspace':'AETC'})
    data=client.get('/dashboard',params={'day':day,'root':'AETC'}).json()
    assert data['coverage']['reported']==1
    assert data['metrics']['counts']['leave']==1
    assert data['metrics']['available']==2
    assert data['staffing']['actual']==3
