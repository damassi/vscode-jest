jest.unmock('../src/diagnostics')

import { updateDiagnostics, resetDiagnositics, failedSuiteCount } from '../src/diagnostics'
import * as vscode from 'vscode'
import { TestFileAssertionStatus, TestReconcilationState, TestAssertionStatus } from 'jest-editor-support'

class MockDiagnosticCollection implements vscode.DiagnosticCollection {
  name = 'test'
  set = jest.fn();
  delete = jest.fn()
  clear = jest.fn()
  forEach = jest.fn()
  get = jest.fn();
  has = jest.fn()
  dispose = jest.fn()
}

describe('test diagnostics', () => {
  describe('resetDiagnositics', () => {
    it('will clear given diagnositics', () => {
      const mockDiagnostics = new MockDiagnosticCollection()
      resetDiagnositics(mockDiagnostics)
      expect(mockDiagnostics.clear).toBeCalled()
    })
  })

  describe('updateDiagnostics', () => {
    // const MockReconciler = (TestReconciler as any) as jest.Mock<any>

    let lineNumber = 17
    function createAssertion(title: string, status: TestReconcilationState): TestAssertionStatus {
      return {
        title,
        status,
        message: `${title} ${status}`,
        line: lineNumber++,
      }
    }
    function createTestResult(
      file: string,
      assertions: TestAssertionStatus[],
      status: TestReconcilationState = 'KnownFail'
    ): TestFileAssertionStatus {
      return { file: file, message: `${file}:${status}`, status, assertions: assertions }
    }

    // vscode component validation helper
    function validateRange(args: any[], startLine: number, startCharacter: number) {
      expect(args[0]).toEqual(startLine)
      expect(args[1]).toEqual(startCharacter)
    }

    function validateDiagnostic(args: any[], message: string, severity: vscode.DiagnosticSeverity) {
      expect(args[1]).toEqual(message)
      expect(args[2]).toEqual(severity)
    }

    beforeEach(() => {
      jest.resetAllMocks()
    })

    it('can handle when all tests passed', () => {
      const mockDiagnostics = new MockDiagnosticCollection()

      updateDiagnostics([], mockDiagnostics)
      expect(mockDiagnostics.clear).not.toBeCalled()
      expect(mockDiagnostics.set).not.toBeCalled()
    })

    it('can update diagnostics from mixed test results', () => {
      const allTests = [
        createTestResult('f1', [createAssertion('a1', 'KnownFail'), createAssertion('a2', 'KnownFail')]),
        createTestResult('f2', [
          createAssertion('a3', 'KnownFail'),
          createAssertion('a4', 'KnownSuccess'),
          createAssertion('a5', 'KnownFail'),
        ]),
        createTestResult('f3', []),
        createTestResult('s4', [createAssertion('a6', 'KnownSuccess')], 'KnownSuccess'),
        createTestResult('s5', [], 'Unknown'),
      ]
      const failedTestSuiteCount = allTests.reduce((sum, t) => sum + (t.status === 'KnownFail' ? 1 : 0), 0)
      const notFailedTestSuiteCount = allTests.reduce((sum, t) => sum + (t.status !== 'KnownFail' ? 1 : 0), 0)
      const failedAssertionCount = allTests
        .filter(t => t.status === 'KnownFail')
        .map(f => f.assertions.filter(a => (a.status = 'KnownFail')))
        .reduce((sum, assertions) => sum + assertions.length, 0)

      const failedTestWithoutAssertionCount = allTests.reduce(
        (sum, t) => sum + (t.status === 'KnownFail' && t.assertions.length === 0 ? 1 : 0),
        0
      )
      const mockDiagnostics = new MockDiagnosticCollection()
      updateDiagnostics(allTests, mockDiagnostics)

      // verified diagnostics are added for all failed tests including files failed to run
      expect(mockDiagnostics.set).toHaveBeenCalledTimes(failedTestSuiteCount)
      expect(vscode.Range).toHaveBeenCalledTimes(failedAssertionCount + failedTestWithoutAssertionCount)
      expect(vscode.Diagnostic).toHaveBeenCalledTimes(failedAssertionCount + failedTestWithoutAssertionCount)

      //verify correctly reported error content
      const setCalls = mockDiagnostics.set.mock.calls
      const rangeCalls = (vscode.Range as jest.Mock<any>).mock.calls
      const diagCalls = (vscode.Diagnostic as jest.Mock<any>).mock.calls

      //validate the diagnosis produced
      let assertion = 0
      for (let i = 0; i < allTests.length; i++) {
        const f = allTests[i]
        if (f.status !== 'KnownFail') {
          continue
        }

        expect(setCalls[i][0].indexOf(f.file)).toBeGreaterThanOrEqual(0)

        if (f.assertions.length <= 0) {
          const rCall = rangeCalls[assertion]
          const dCall = diagCalls[assertion]
          validateDiagnostic(dCall, f.message, vscode.DiagnosticSeverity.Error)
          validateRange(rCall, 0, 0)
          assertion++
        } else {
          f.assertions.forEach(a => {
            const rCall = rangeCalls[assertion]
            const dCall = diagCalls[assertion]

            validateDiagnostic(dCall, a.message, vscode.DiagnosticSeverity.Error)
            validateRange(rCall, a.line - 1, 0)
            assertion++
          })
        }
      }
      // verify: removed passed tests
      expect(mockDiagnostics.delete).toHaveBeenCalledTimes(notFailedTestSuiteCount)
    })
    it('knows how many failed suite from diagnostics', () => {
      const mockDiagnostics = new MockDiagnosticCollection()
      const invokeCount = 7
      mockDiagnostics.forEach.mockImplementation(f => {
        for (let i = 0; i < invokeCount; i++) {
          f({})
        }
      })

      expect(failedSuiteCount(mockDiagnostics)).toEqual(invokeCount)
    })
  })
})
